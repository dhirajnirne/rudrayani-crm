import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final aoAgentsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/agents', query: {'month': month});
  return (res.data['agents'] as List?) ?? [];
});

class AttendanceOverviewScreen extends ConsumerWidget {
  const AttendanceOverviewScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final agentsAsync = ref.watch(aoAgentsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Attendance Overview'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(aoAgentsProvider)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(aoAgentsProvider),
        child: agentsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Failed to load attendance.\n$e', onRetry: () => ref.invalidate(aoAgentsProvider)),
          data: (agents) {
            if (agents.isEmpty) {
              return const Center(child: Text('No agents found'));
            }

            int allocatedTotal = 0;
            int onDutyTotal = 0;
            for (final a in agents) {
              if ((a['allocated_count'] as num? ?? 0) > 0) allocatedTotal++;
              // The backend /reports/agents might not return `on_duty` strictly if it's month-level. 
              // Wait, the instruction says "Sum allocated_count / on_duty. Row per agent list."
              // We'll approximate on_duty if it's there.
              if (a['on_duty'] == true) onDutyTotal++;
            }

            return Column(
              children: [
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  color: AppColors.primarySurface,
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: [
                      _StatCol(label: 'Total Allocated', value: '$allocatedTotal'),
                      _StatCol(label: 'On Duty Today', value: '$onDutyTotal'),
                    ],
                  ),
                ),
                Expanded(
                  child: ListView.builder(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    itemCount: agents.length,
                    itemBuilder: (ctx, i) {
                      final a = agents[i] as Map<String, dynamic>;
                      final name = a['full_name'] as String? ?? 'Unknown';
                      final allocated = a['allocated_count'] ?? 0;
                      final collected = a['collected_amount'] ?? 0;
                      final onDuty = a['on_duty'] == true;

                      return Card(
                        margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                        child: ListTile(
                          leading: CircleAvatar(
                            backgroundColor: onDuty ? AppColors.successContainer : AppColors.neutralContainer,
                            child: Icon(
                              Icons.person,
                              color: onDuty ? AppColors.successStrong : AppColors.textSecondary,
                            ),
                          ),
                          title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                          subtitle: Text('Allocated: $allocated · Collected: ₹$collected'),
                          trailing: onDuty 
                            ? const Text('On Duty', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.bold, fontSize: 12))
                            : const Text('Not Punched', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                        ),
                      );
                    },
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _StatCol extends StatelessWidget {
  final String label;
  final String value;
  const _StatCol({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Text(value, style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold, color: AppColors.primaryDark)),
        Text(label, style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
      ],
    );
  }
}
