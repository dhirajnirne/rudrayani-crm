import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final ltBranchesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/branches');
  return (res.data['branches'] as List?) ?? [];
});

final ltLiveTrackingProvider = FutureProvider.autoDispose.family<List<dynamic>, String?>((ref, branchId) async {
  final query = <String, dynamic>{};
  if (branchId != null) query['branch_id'] = branchId;
  final res = await ref.read(apiClientProvider).get('/tracking/live', query: query);
  final agents = (res.data['agents'] as List?)?.cast<Map<String, dynamic>>() ?? [];
  
  // Sort by last ping time, descending
  agents.sort((a, b) {
    final tA = a['last_ping_at'] as String?;
    final tB = b['last_ping_at'] as String?;
    if (tA == null && tB == null) return 0;
    if (tA == null) return 1;
    if (tB == null) return -1;
    return DateTime.parse(tB).compareTo(DateTime.parse(tA));
  });

  return agents;
});

class LiveTrackingScreen extends ConsumerStatefulWidget {
  const LiveTrackingScreen({super.key});

  @override
  ConsumerState<LiveTrackingScreen> createState() => _LiveTrackingScreenState();
}

class _LiveTrackingScreenState extends ConsumerState<LiveTrackingScreen> {
  String? _selectedBranchId;

  @override
  Widget build(BuildContext context) {
    final branchesAsync = ref.watch(ltBranchesProvider);
    final agentsAsync = ref.watch(ltLiveTrackingProvider(_selectedBranchId));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Live Tracking'),
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
          ref.invalidate(ltBranchesProvider);
          ref.invalidate(ltLiveTrackingProvider(_selectedBranchId));
        },
        child: agentsAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Failed to load tracking.\n$e', onRetry: () {
            ref.invalidate(ltLiveTrackingProvider(_selectedBranchId));
          }),
          data: (agents) {
            if (agents.isEmpty) {
              return const Center(child: Text('No agents tracked in this branch'));
            }
            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: agents.length,
              itemBuilder: (ctx, i) {
                final m = agents[i] as Map<String, dynamic>;
                final name = m['full_name'] as String? ?? 'Unknown';
                // Backend tracking/live doesn't return branch directly, but we might have branch name.
                // If not, we can omit it or show role.
                final isField = m['is_field_agent'] == true;
                final roleStr = isField ? 'Field Agent' : 'Telecaller';
                final lastPing = m['last_ping_at'] as String?;

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
                                  roleStr,
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
                          child: lastPing != null
                              ? Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    const Icon(Icons.location_on, size: 16, color: AppColors.success),
                                    const SizedBox(height: 4),
                                    Text(
                                      'Ping: ${DateFormat('HH:mm').format(DateTime.parse(lastPing).toLocal())}',
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
                                    'No signal',
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
