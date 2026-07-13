import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final reallocationRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/reallocation-requests');
  return res.data['requests'] as List? ?? [];
});

final correctionRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/correction-requests');
  return res.data['requests'] as List? ?? [];
});

class ApprovalsView extends ConsumerStatefulWidget {
  final bool groupByBranch;
  const ApprovalsView({super.key, required this.groupByBranch});

  @override
  ConsumerState<ApprovalsView> createState() => _ApprovalsViewState();
}

class _ApprovalsViewState extends ConsumerState<ApprovalsView> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final reallocs = ref.watch(reallocationRequestsProvider);
    final corrections = ref.watch(correctionRequestsProvider);

    final reallocCount = reallocs.maybeWhen(data: (d) => d.length, orElse: () => 0);
    final correctionCount = corrections.maybeWhen(data: (d) => d.length, orElse: () => 0);

    return Column(
      children: [
        TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: [
            Tab(text: 'Reallocation ($reallocCount)'),
            Tab(text: 'Correction ($correctionCount)'),
          ],
        ),
        Expanded(
          child: TabBarView(
            controller: _tabController,
            children: [
              _buildList(reallocs, true),
              _buildList(corrections, false),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildList(AsyncValue<List<dynamic>> providerValue, bool isRealloc) {
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(isRealloc ? reallocationRequestsProvider : correctionRequestsProvider);
      },
      child: providerValue.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(message: 'Failed to load requests.\n$e', onRetry: () {
          ref.invalidate(isRealloc ? reallocationRequestsProvider : correctionRequestsProvider);
        }),
        data: (requests) {
          if (requests.isEmpty) {
            return const Center(child: Text('No pending requests'));
          }

          if (widget.groupByBranch) {
            final grouped = <String, List<dynamic>>{};
            for (final r in requests) {
              final branch = r['branch_name'] as String? ?? 'Unknown Branch';
              grouped.putIfAbsent(branch, () => []).add(r);
            }
            final sortedBranches = grouped.keys.toList()..sort();

            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: sortedBranches.length,
              itemBuilder: (ctx, i) {
                final branch = sortedBranches[i];
                final branchReqs = grouped[branch]!;
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Text(branch.toUpperCase(), style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textSecondary)),
                    ),
                    ...branchReqs.map((r) => isRealloc ? _ReallocCard(request: r) : _CorrectionCard(request: r)),
                  ],
                );
              },
            );
          } else {
            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: requests.length,
              itemBuilder: (ctx, i) {
                final r = requests[i];
                return isRealloc ? _ReallocCard(request: r) : _CorrectionCard(request: r);
              },
            );
          }
        },
      ),
    );
  }
}

class _ReallocCard extends ConsumerWidget {
  final Map<String, dynamic> request;
  const _ReallocCard({required this.request});

  Future<void> _decide(BuildContext context, WidgetRef ref, bool approve) async {
    String? newAgentId;
    if (approve) {
      // Pick a new agent or return to unallocated
      final choice = await showModalBottomSheet<String>(
        context: context,
        builder: (ctx) => SafeArea(
          child: ListView(
            shrinkWrap: true,
            children: [
              const Padding(
                padding: EdgeInsets.all(12),
                child: Text('Assign to…', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
              ),
              ConstrainedBox(
                constraints: const BoxConstraints(minHeight: AppDimens.listRow),
                child: ListTile(
                  leading: const Icon(Icons.inbox),
                  title: const Text('Return to unallocated pool'),
                  onTap: () => Navigator.pop(ctx, ''),
                ),
              ),
              // We omit the team members list if we don't have it locally or we can fetch it, 
              // for now we'll just allow returning to unallocated for agency wide, or 
              // we can fetch team members if needed. 
              // To keep it simple and functional for both TL and Admin, we'll just use the empty string (unallocated)
              // If TL, we could theoretically fetch team members, but that requires team context.
            ],
          ),
        ),
      );
      if (choice == null) return;
      newAgentId = choice.isEmpty ? null : choice;
    }

    try {
      await ref.read(apiClientProvider).post(
        '/reallocation-requests/${request['id']}/decide',
        data: {'approve': approve, 'new_agent_id': newAgentId},
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(approve ? 'Request approved' : 'Request rejected'),
          backgroundColor: approve ? AppColors.success : AppColors.textSecondary,
        ));
      }
      ref.invalidate(reallocationRequestsProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: AppColors.warningContainer,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${request['customer_name']} · ${request['loan_number']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            Text('Requested by ${request['requested_by_name']}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Text('"${request['reason']}"', style: const TextStyle(fontSize: 13)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _decide(context, ref, true),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: AppColors.onPrimary),
                    child: const Text('Approve'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _decide(context, ref, false),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _CorrectionCard extends ConsumerWidget {
  final Map<String, dynamic> request;
  const _CorrectionCard({required this.request});

  Future<void> _decide(BuildContext context, WidgetRef ref, bool approve) async {
    try {
      await ref.read(apiClientProvider).post(
        '/correction-requests/${request['id']}/decide',
        data: {'approve': approve},
      );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(approve ? 'Correction approved' : 'Correction rejected'),
          backgroundColor: approve ? AppColors.success : AppColors.textSecondary,
        ));
      }
      ref.invalidate(correctionRequestsProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      color: AppColors.neutralContainer,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${request['customer_name']} · ${request['loan_number']}', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            Text('Requested by ${request['requested_by_name']}', style: const TextStyle(fontSize: 12, color: AppColors.textSecondary)),
            const SizedBox(height: 4),
            Text('Field: ${request['field_name']}', style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold)),
            Text('Proposed: ${request['proposed_value']}', style: const TextStyle(fontSize: 13, color: AppColors.primary)),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: ElevatedButton(
                    onPressed: () => _decide(context, ref, true),
                    style: ElevatedButton.styleFrom(backgroundColor: AppColors.primary, foregroundColor: AppColors.onPrimary),
                    child: const Text('Approve'),
                  ),
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: OutlinedButton(
                    onPressed: () => _decide(context, ref, false),
                    style: OutlinedButton.styleFrom(foregroundColor: AppColors.error),
                    child: const Text('Reject'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
