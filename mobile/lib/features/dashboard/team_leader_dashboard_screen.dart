import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import 'dashboard_widgets.dart';

String _lakh(num? v) {
  if (v == null) return '—';
  final l = v / 100000;
  if (l.abs() >= 0.01) return '${l.toStringAsFixed(2)}L';
  return NumberFormat.decimalPattern('en_IN').format(v);
}

/// Team-wide "today" snapshot -- attendance/GPS, cash vs online, receipts --
/// reuses /tracking/team-day (already team-scoped for a TL, Phase 12 also
/// extended it with cash_total/online_total/field_visits* per member so this
/// dashboard doesn't need its own aggregation query).
final tlTeamDayProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/tracking/team-day');
  return (res.data['members'] as List).cast<Map<String, dynamic>>();
});

/// Follow-ups due today, per team member (ptps.promised_date <= today,
/// status='pending') -- reuses the existing /day-plan summary endpoint.
final tlDayPlanProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/day-plan');
  return (res.data['agents'] as List).cast<Map<String, dynamic>>();
});

/// PTP Created/Kept/Broken for the TL's own team, this month -- team_id is
/// passed explicitly (rather than relying on /reports/trail's own scope
/// clamp) so the team boundary is unambiguous regardless of the caller's
/// exact permission mix.
final tlTrailProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final teamId = ref.read(authProvider).user?['team_id'] as String?;
  final now = DateTime.now();
  final from = DateFormat('yyyy-MM-01').format(now);
  final to = DateFormat('yyyy-MM-dd').format(now);
  final res = await ref.read(apiClientProvider).get('/reports/trail', query: {
    'from': from,
    'to': to,
    'team_id': ?teamId,
  });
  return res.data as Map<String, dynamic>;
});

class TeamLeaderDashboardScreen extends ConsumerWidget {
  const TeamLeaderDashboardScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(tlTeamDayProvider);
    ref.invalidate(tlDayPlanProvider);
    ref.invalidate(tlTrailProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final teamDay = ref.watch(tlTeamDayProvider);
    final dayPlan = ref.watch(tlDayPlanProvider);
    final trail = ref.watch(tlTrailProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Team Dashboard'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refresh(ref)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _refresh(ref),
        child: teamDay.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Could not load the team dashboard.\n$e', onRetry: () => _refresh(ref)),
          data: (members) {
            if (members.isEmpty) {
              return const EmptyState(message: 'No team members found', hint: 'Ask an admin to assign agents to your team');
            }
            return ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                const DashboardSectionHeader('Attendance / GPS'),
                _AttendanceSummary(members: members),
                const SizedBox(height: AppSpacing.sm),
                for (final m in members) _AttendanceRow(member: m),

                const DashboardSectionHeader('Collections Today'),
                _CollectionsSummary(members: members),

                const DashboardSectionHeader('Receipts & Documents'),
                _ReceiptsSummary(members: members),

                const DashboardSectionHeader('Follow-ups Due Today'),
                dayPlan.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => InlineErrorNote(message: 'Follow-ups: $e'),
                  data: (agents) => _FollowUpsSummary(agents: agents),
                ),

                const DashboardSectionHeader('PTP Created / Kept / Broken (This Month)'),
                trail.when(
                  loading: () => const Padding(
                    padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
                    child: Center(child: CircularProgressIndicator()),
                  ),
                  error: (e, _) => InlineErrorNote(message: 'PTP summary: $e'),
                  data: (d) => DashboardStatGrid(cards: [
                    DashboardStatCard(label: 'Created', value: '${d['ptps_created'] ?? 0}'),
                    DashboardStatCard(
                        label: 'Kept', value: '${d['ptps_kept'] ?? 0}', accent: AppColors.success),
                    DashboardStatCard(
                        label: 'Broken', value: '${d['ptps_broken'] ?? 0}', accent: AppColors.error),
                    DashboardStatCard(
                        label: 'Conversion',
                        value: d['ptp_conversion_pct'] != null
                            ? '${(d['ptp_conversion_pct'] as num).toStringAsFixed(1)}%'
                            : '—'),
                  ]),
                ),

                const DashboardSectionHeader('Route Map'),
                for (final m in members) _RouteRow(userId: m['user_id'] as String, name: m['full_name'] as String),
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

class _AttendanceRow extends StatelessWidget {
  final Map<String, dynamic> member;
  const _AttendanceRow({required this.member});

  @override
  Widget build(BuildContext context) {
    final onDuty = member['on_duty'] == true;
    final firstIn = member['first_in'] != null
        ? DateFormat('HH:mm').format(DateTime.parse(member['first_in'] as String).toLocal())
        : null;
    final lastOut = member['last_out'] != null
        ? DateFormat('HH:mm').format(DateTime.parse(member['last_out'] as String).toLocal())
        : null;
    return Container(
      constraints: const BoxConstraints(minHeight: AppDimens.listRow),
      margin: const EdgeInsets.only(bottom: AppSpacing.xs),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: onDuty ? AppColors.successContainer : AppColors.neutralContainer,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(member['full_name'] as String,
                style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
          ),
          Text(
            firstIn == null ? 'Not punched in' : '$firstIn – ${lastOut ?? "now"}',
            style: const TextStyle(fontSize: 12, color: AppColors.textSecondary).tabular,
          ),
        ],
      ),
    );
  }
}

class _CollectionsSummary extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  const _CollectionsSummary({required this.members});

  @override
  Widget build(BuildContext context) {
    final cash = members.fold<double>(0, (s, m) => s + ((m['cash_total'] as num?)?.toDouble() ?? 0));
    final online = members.fold<double>(0, (s, m) => s + ((m['online_total'] as num?)?.toDouble() ?? 0));
    return DashboardStatGrid(cards: [
      DashboardStatCard(label: 'Cash', value: '₹ ${_lakh(cash)}', accent: AppColors.success),
      DashboardStatCard(label: 'Online', value: '₹ ${_lakh(online)}', accent: AppColors.info),
    ]);
  }
}

class _ReceiptsSummary extends StatelessWidget {
  final List<Map<String, dynamic>> members;
  const _ReceiptsSummary({required this.members});

  @override
  Widget build(BuildContext context) {
    final visits = members.fold<int>(0, (s, m) => s + ((m['field_visits'] as num?)?.toInt() ?? 0));
    final withPhoto = members.fold<int>(0, (s, m) => s + ((m['field_visits_with_photo'] as num?)?.toInt() ?? 0));
    final withSig =
        members.fold<int>(0, (s, m) => s + ((m['field_visits_with_signature'] as num?)?.toInt() ?? 0));
    return DashboardStatGrid(cards: [
      DashboardStatCard(label: 'Receipts Generated', value: '$visits'),
      DashboardStatCard(label: 'With Photo', value: '$withPhoto'),
      DashboardStatCard(label: 'With Signature', value: '$withSig'),
    ]);
  }
}

class _FollowUpsSummary extends StatelessWidget {
  final List<Map<String, dynamic>> agents;
  const _FollowUpsSummary({required this.agents});

  @override
  Widget build(BuildContext context) {
    final count = agents.fold<int>(
        0, (s, a) => s + (((a['ptps_due'] as Map<String, dynamic>?)?['count'] as num?)?.toInt() ?? 0));
    final total = agents.fold<double>(
        0, (s, a) => s + (((a['ptps_due'] as Map<String, dynamic>?)?['total_amount'] as num?)?.toDouble() ?? 0));
    return DashboardStatGrid(cards: [
      DashboardStatCard(label: 'Due Today', value: '$count'),
      DashboardStatCard(label: 'Promised Amount', value: '₹ ${_lakh(total)}'),
    ]);
  }
}

/// Lightweight route summary (distance + point count), fetched on demand per
/// member rather than a full interactive map -- the app has no map rendering
/// dependency yet, so this reuses /tracking/route's data without introducing
/// one mid-phase (see Phase 12 report for the deferred-work note).
class _RouteRow extends ConsumerStatefulWidget {
  final String userId;
  final String name;
  const _RouteRow({required this.userId, required this.name});

  @override
  ConsumerState<_RouteRow> createState() => _RouteRowState();
}

class _RouteRowState extends ConsumerState<_RouteRow> {
  Map<String, dynamic>? _route;
  bool _loading = false;
  String? _error;

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final res = await ref.read(apiClientProvider).get('/tracking/route', query: {
        'user_id': widget.userId,
        'date': today,
      });
      setState(() => _route = res.data as Map<String, dynamic>);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      constraints: const BoxConstraints(minHeight: AppDimens.listRow),
      margin: const EdgeInsets.only(bottom: AppSpacing.xs),
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md, vertical: AppSpacing.sm),
      decoration: BoxDecoration(
        color: AppColors.primarySurface,
        borderRadius: BorderRadius.circular(AppRadius.md),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(widget.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                if (_route != null)
                  Text(
                    '${((_route!['distance_meters'] as num) / 1000).toStringAsFixed(1)} km · '
                    '${(_route!['points'] as List).length} pings',
                    style: const TextStyle(fontSize: 12, color: AppColors.textSecondary).tabular,
                  )
                else if (_error != null)
                  Text(_error!, style: const TextStyle(fontSize: 11, color: AppColors.error)),
              ],
            ),
          ),
          SizedBox(
            height: AppDimens.tapTarget,
            child: TextButton(
              onPressed: _loading ? null : _load,
              child: _loading
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : Text(_route == null ? "Today's route" : 'Refresh'),
            ),
          ),
        ],
      ),
    );
  }
}
