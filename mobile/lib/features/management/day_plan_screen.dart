import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final branchesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/branches');
  return (res.data['branches'] as List?) ?? [];
});

final mgtDayPlanProvider = FutureProvider.autoDispose.family<List<dynamic>, String?>((ref, branchId) async {
  final date = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final query = <String, dynamic>{'date': date};
  if (branchId != null) query['branch_id'] = branchId;
  final res = await ref.read(apiClientProvider).get('/day-plan', query: query);
  return (res.data['members'] as List?) ?? [];
});

class DayPlanScreen extends ConsumerStatefulWidget {
  const DayPlanScreen({super.key});

  @override
  ConsumerState<DayPlanScreen> createState() => _DayPlanScreenState();
}

class _DayPlanScreenState extends ConsumerState<DayPlanScreen> {
  String? _selectedBranchId;

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(branchesProvider);
    final planAsync = ref.watch(mgtDayPlanProvider(_selectedBranchId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Day Plan'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            height: 48,
            alignment: Alignment.centerLeft,
            child: branchesAsync.when(
              data: (branches) {
                return ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: const Text('All Branches'),
                        selected: _selectedBranchId == null,
                        onSelected: (_) => setState(() => _selectedBranchId = null),
                        selectedColor: AppColors.primarySurface,
                        checkmarkColor: AppColors.primaryDark,
                      ),
                    ),
                    ...branches.map((b) => Padding(
                          padding: const EdgeInsets.only(right: 8),
                          child: FilterChip(
                            label: Text(b['name'] as String? ?? ''),
                            selected: _selectedBranchId == b['id'],
                            onSelected: (_) => setState(() => _selectedBranchId = b['id'] as String),
                            selectedColor: AppColors.primarySurface,
                            checkmarkColor: AppColors.primaryDark,
                          ),
                        )),
                  ],
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: Text('Loading branches...'),
              ),
              error: (_, __) => const SizedBox.shrink(),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(branchesProvider);
          ref.invalidate(mgtDayPlanProvider(_selectedBranchId));
        },
        child: planAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Failed to load day plan.\n$e', onRetry: () {
            ref.invalidate(mgtDayPlanProvider(_selectedBranchId));
          }),
          data: (members) {
            if (members.isEmpty) {
              return const Center(child: Text('No agents found in this branch'));
            }
            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: members.length,
              itemBuilder: (ctx, i) {
                final m = members[i] as Map<String, dynamic>;
                final name = m['full_name'] as String? ?? 'Unknown';
                final branch = m['branch_name'] as String? ?? 'No Branch';
                final isField = m['is_field_agent'] == true;
                final roleStr = isField ? 'Field Agent' : 'Telecaller';
                final onDuty = m['on_duty'] == true;

                return Card(
                  margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                  child: ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: AppDimens.listRow),
                    child: Row(
                      children: [
                        Expanded(
                          child: Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  '$branch · $roleStr',
                                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                        Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 12),
                          child: onDuty
                              ? Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Container(
                                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                      decoration: BoxDecoration(
                                        color: AppColors.successContainer,
                                        borderRadius: BorderRadius.circular(4),
                                      ),
                                      child: Text(
                                        'PTP: ${m['ptps'] ?? 0}',
                                        style: const TextStyle(
                                          fontSize: 10,
                                          color: AppColors.successStrong,
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      isField ? 'Visits: ${m['field_visits'] ?? 0}' : 'Calls: ${m['calls'] ?? 0}',
                                      style: const TextStyle(fontSize: 11, color: AppColors.textSecondary),
                                    ),
                                  ],
                                )
                              : Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: AppColors.neutralContainer,
                                    borderRadius: BorderRadius.circular(4),
                                  ),
                                  child: const Text(
                                    'Not punched in',
                                    style: TextStyle(
                                      fontSize: 11,
                                      color: AppColors.textSecondary,
                                      fontWeight: FontWeight.bold,
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }
}
