import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import '../approvals/approvals_view.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/state_views.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

/// TL toggle view (brief §8): team live status + attendance + performance,
/// and reallocation approvals.
final teamDayProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/tracking/team-day');
  return (res.data['members'] as List).cast<Map<String, dynamic>>();
});

final liveStatusProvider = FutureProvider.autoDispose<Map<String, Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/tracking/live');
  final agents = (res.data['agents'] as List).cast<Map<String, dynamic>>();
  return {for (final a in agents) a['user_id'] as String: a};
});

// Reallocation requests provider has been moved to approvals_view.dart

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(teamDayProvider);
    ref.invalidate(liveStatusProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(teamDayProvider);
    final live = ref.watch(liveStatusProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.onPrimary,
        title: const Text('My Team'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refresh(ref)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _refresh(ref),
        child: ListView(
          padding: const EdgeInsets.all(12),
          children: [
            const SizedBox(
              height: 400,
              child: ApprovalsView(groupByBranch: false),
            ),
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 8),
              child: Text('Team Today',
                  style: TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.primary)),
            ),
            day.when(
              loading: () => const Center(
                  child: Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator())),
              error: (e, _) => _ErrorTile(
                'Team: $e',
                onRetry: () => ref.invalidate(teamDayProvider),
              ),
              data: (members) => members.isEmpty
                  ? const EmptyState(
                      icon: Icons.groups_outlined,
                      message: 'No team members found.',
                    )
                  : Column(
                children: [
                  for (final m in members)
                    _MemberCard(
                      member: m,
                      live: live?[m['user_id']],
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MemberCard extends StatelessWidget {
  final Map<String, dynamic> member;
  final Map<String, dynamic>? live;
  const _MemberCard({required this.member, this.live});

  @override
  Widget build(BuildContext context) {
    final onDuty = member['on_duty'] == true;
    final status = live?['status'] as String?;
    final minutes = (member['minutes_worked'] as num?)?.toInt() ?? 0;
    final payTotal = (member['payments_total'] as num?)?.toDouble() ?? 0;

    Color chipColor;
    String chipText;
    if (!onDuty) {
      chipColor = AppColors.textSecondary;
      chipText = member['first_in'] != null ? 'Punched out' : 'Off duty';
    } else if (status == 'stationary') {
      chipColor = AppColors.error;
      chipText = 'Stationary ${live?['stationary_minutes']} min';
    } else if (status == 'no_signal') {
      chipColor = AppColors.warning;
      chipText = 'No signal';
    } else {
      chipColor = AppColors.success;
      chipText = 'On duty';
    }

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(member['full_name'] as String,
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: chipColor.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(chipText,
                      style: TextStyle(
                          fontSize: 11, color: chipColor, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              '${minutes ~/ 60}h ${minutes % 60}m worked · '
              '${member['calls']} calls · ${member['ptps']} PTPs · '
              '${member['payments_count']} payments (${_rupee.format(payTotal)})',
              style: const TextStyle(fontSize: 12, color: AppColors.textSecondary).tabular,
            ),
            if (live?['last_ping_at'] != null)
              Text(
                'Last ping ${DateFormat('HH:mm').format(DateTime.parse(live!['last_ping_at'] as String).toLocal())}',
                style: const TextStyle(fontSize: 11, color: AppColors.textSecondary).tabular,
              ),
          ],
        ),
      ),
    );
  }
}

class _ErrorTile extends StatelessWidget {
  final String message;
  final VoidCallback? onRetry;
  const _ErrorTile(this.message, {this.onRetry});

  @override
  Widget build(BuildContext context) => InlineErrorNote(
        message: message,
        onRetry: onRetry,
      );
}
