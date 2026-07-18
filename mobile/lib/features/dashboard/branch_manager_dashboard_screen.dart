import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../../core/utils/parser.dart';
import 'dashboard_widgets.dart';

String _lakh(num? v) {
  if (v == null) return '—';
  final l = v / 100000;
  if (l.abs() >= 0.01) return '${l.toStringAsFixed(2)}L';
  return NumberFormat.decimalPattern('en_IN').format(v);
}

/// Branch-wide "today" snapshot -- reuses /tracking/team-day exactly like
/// the Team Leader dashboard; scopeFilter() already resolves a
/// branch_manager to their whole branch (including multi-branch telecallers
/// assigned there via telecaller_branches), so no branch_id param is needed.
final bmBranchDayProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/tracking/team-day');
  return (res.data['members'] as List).cast<Map<String, dynamic>>();
});

/// Per-team breakdown for the branch -- a branch_manager's unit of
/// drill-down is teams, not individual agents directly, so this reuses
/// /reports/breakdown?dimension=team (already branch-clamped via
/// resolveReportScope) instead of a flat member list.
final bmTeamBreakdownProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final now = DateTime.now();
  final month = DateFormat('yyyy-MM').format(now);
  final res = await ref.read(apiClientProvider).get('/reports/breakdown', query: {
    'month': month,
    'dimension': 'team',
  });
  return (res.data['rows'] as List).cast<Map<String, dynamic>>();
});

class BranchManagerDashboardScreen extends ConsumerWidget {
  const BranchManagerDashboardScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(bmBranchDayProvider);
    ref.invalidate(bmTeamBreakdownProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final branchDay = ref.watch(bmBranchDayProvider);
    final teamBreakdown = ref.watch(bmTeamBreakdownProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Branch Dashboard'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refresh(ref)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _refresh(ref),
        child: branchDay.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Could not load the branch dashboard.\n$e', onRetry: () => _refresh(ref)),
          data: (members) {
            if (members.isEmpty) {
              return const EmptyState(message: 'No branch members found', hint: 'Ask an admin to assign this branch');
            }
            return ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                const DashboardSectionHeader('Attendance / GPS (Branch-wide)'),
                _AttendanceSummary(members: members),

                const DashboardSectionHeader('Collections Today'),
                _CollectionsSummary(members: members),

                const DashboardSectionHeader('Teams in this Branch'),
                teamBreakdown.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => InlineErrorNote(message: 'Team breakdown: $e'),
                  data: (rows) => rows.isEmpty
                      ? const Padding(
                          padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                          child: Text('No teams with activity this month', style: TextStyle(color: AppColors.textSecondary)),
                        )
                      : Column(children: [for (final r in rows) _TeamRow(row: r)]),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _AttendanceSummary extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  const _AttendanceSummary({required this.members});

  @override
  Widget build(BuildContext context) {
    final onDuty = members.where((m) => m['on_duty'] == true).length;
    return DashboardStatGrid(cards: [
      DashboardStatCard(label: 'On Duty', value: '$onDuty / ${members.length}', accent: AppColors.success),
      DashboardStatCard(
        label: 'Punched In',
        value: '${members.where((m) => m['first_in'] != null).length}',
      ),
    ]);
  }
}

class _CollectionsSummary extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  const _CollectionsSummary({required this.members});

  @override
  Widget build(BuildContext context) {
    final cash = members.fold<double>(0, (s, m) => s + (parseDouble(m['cash_total']) ?? 0.0));
    final online = members.fold<double>(0, (s, m) => s + (parseDouble(m['online_total']) ?? 0.0));
    return DashboardStatGrid(cards: [
      DashboardStatCard(label: 'Cash', value: '₹ ${_lakh(cash)}', accent: AppColors.success),
      DashboardStatCard(label: 'Online', value: '₹ ${_lakh(online)}', accent: AppColors.info),
    ]);
  }
}

/// Tapping a team drills into its member roster (reuses the same
/// /account/team/:id/members route + EmployeeDetailScreen chain built for
/// the "My Teams" list, see router.dart) -- one drill-down pattern, multiple
/// entry points.
class _TeamRow extends StatelessWidget {
  final Map<String, dynamic> row;
  const _TeamRow({required this.row});

  @override
  Widget build(BuildContext context) {
    final key = row['key'] as String?;
    final achievement = parseDouble(row['achievement_pct']);
    return Container(
      constraints: const BoxConstraints(minHeight: AppDimens.listRow),
      margin: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Material(
        color: AppColors.neutralContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
        child: InkWell(
          borderRadius: BorderRadius.circular(AppRadius.md),
          onTap: key == null ? null : () => context.push('/account/team/$key/members'),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(row['label'] as String? ?? '—',
                          style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text(
                        '₹ ${_lakh(parseDouble(row['collected_amount']))} collected'
                        '${achievement != null ? ' · ${achievement.toStringAsFixed(1)}%' : ''}',
                        style: const TextStyle(fontSize: 12, color: AppColors.textSecondary).tabular,
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right, color: AppColors.textSecondary),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
