import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';

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

final pendingRequestsProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/reallocation-requests');
  return (res.data['requests'] as List).cast<Map<String, dynamic>>();
});

class TeamScreen extends ConsumerWidget {
  const TeamScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(teamDayProvider);
    ref.invalidate(liveStatusProvider);
    ref.invalidate(pendingRequestsProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final day = ref.watch(teamDayProvider);
    final live = ref.watch(liveStatusProvider);
    final requests = ref.watch(pendingRequestsProvider);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
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
            requests.when(
              loading: () => const SizedBox.shrink(),
              error: (e, _) => _ErrorTile('Approvals: $e'),
              data: (reqs) => reqs.isEmpty
                  ? const SizedBox.shrink()
                  : _ApprovalsSection(requests: reqs, onDecided: () => _refresh(ref)),
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
              error: (e, _) => _ErrorTile('Team: $e'),
              data: (members) => Column(
                children: [
                  for (final m in members)
                    _MemberCard(
                      member: m,
                      live: live.valueOrNull?[m['user_id']],
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
      chipColor = Colors.grey;
      chipText = member['first_in'] != null ? 'Punched out' : 'Off duty';
    } else if (status == 'stationary') {
      chipColor = Colors.red;
      chipText = 'Stationary ${live?['stationary_minutes']} min';
    } else if (status == 'no_signal') {
      chipColor = Colors.orange;
      chipText = 'No signal';
    } else {
      chipColor = Colors.green;
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
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
            if (live?['last_ping_at'] != null)
              Text(
                'Last ping ${DateFormat('HH:mm').format(DateTime.parse(live!['last_ping_at'] as String).toLocal())}',
                style: const TextStyle(fontSize: 11, color: Colors.grey),
              ),
          ],
        ),
      ),
    );
  }
}

class _ApprovalsSection extends ConsumerWidget {
  final List<Map<String, dynamic>> requests;
  final VoidCallback onDecided;
  const _ApprovalsSection({required this.requests, required this.onDecided});

  Future<void> _decide(
    BuildContext context,
    WidgetRef ref,
    Map<String, dynamic> request,
    bool approve,
  ) async {
    String? newAgentId;
    if (approve) {
      // Pick a new agent from the team, or return to the unallocated pool.
      final members = ref.read(teamDayProvider).valueOrNull ?? [];
      final candidates =
          members.where((m) => m['user_id'] != request['requested_by_id']).toList();
      final choice = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text('Assign to…',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              ListTile(
                leading: const Icon(Icons.inbox),
                title: const Text('Return to unallocated pool'),
                onTap: () => Navigator.pop(ctx, ''),
              ),
              for (final m in candidates)
                ListTile(
                  leading: const Icon(Icons.person),
                  title: Text(m['full_name'] as String),
                  onTap: () => Navigator.pop(ctx, m['user_id'] as String),
                ),
            ],
          ),
        ),
      );
      if (choice == null) return; // cancelled
      newAgentId = choice.isEmpty ? null : choice;
    }

    try {
      await ref.read(apiClientProvider).post(
        '/reallocation-requests/${request['id']}/decide',
        data: {
          'approve': approve,
          'new_agent_id': ?newAgentId,
        },
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(approve ? 'Request approved' : 'Request rejected'),
          backgroundColor: approve ? Colors.green : Colors.grey,
        ));
      }
      onDecided();
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Failed: $e'), backgroundColor: Colors.red));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Reallocation Approvals (${requests.length})',
            style: const TextStyle(
                fontWeight: FontWeight.bold, fontSize: 14, color: AppColors.primary)),
        const SizedBox(height: 8),
        for (final r in requests)
          Card(
            margin: const EdgeInsets.only(bottom: 8),
            color: AppColors.warningContainer,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${r['customer_name']} · ${r['loan_number']}',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                  Text('Requested by ${r['requested_by_name']}',
                      style: const TextStyle(fontSize: 12, color: Colors.grey)),
                  const SizedBox(height: 4),
                  Text('"${r['reason']}"', style: const TextStyle(fontSize: 13)),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: ElevatedButton(
                          onPressed: () => _decide(context, ref, r, true),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: AppColors.primary,
                            foregroundColor: Colors.white,
                          ),
                          child: const Text('Approve'),
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: OutlinedButton(
                          onPressed: () => _decide(context, ref, r, false),
                          style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                          child: const Text('Reject'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

class _ErrorTile extends StatelessWidget {
  final String message;
  const _ErrorTile(this.message);

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(8),
        child: Text(message, style: const TextStyle(color: Colors.red, fontSize: 12)),
      );
}
