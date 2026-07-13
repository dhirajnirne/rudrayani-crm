import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final orgChartProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/org-chart');
  return (res.data['tree'] as List?) ?? [];
});

class OrgChartScreen extends ConsumerWidget {
  const OrgChartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final chartAsync = ref.watch(orgChartProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Org Chart'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(orgChartProvider)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(orgChartProvider),
        child: chartAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Failed to load org chart.\n$e', onRetry: () => ref.invalidate(orgChartProvider)),
          data: (tree) {
            if (tree.isEmpty) {
              return const Center(child: Text('No org chart data available'));
            }
            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: tree.length,
              itemBuilder: (ctx, i) => _buildNode(tree[i] as Map<String, dynamic>, 0),
            );
          },
        ),
      ),
    );
  }

  Widget _buildNode(Map<String, dynamic> node, int depth) {
    final name = node['name'] as String? ?? 'Unknown';
    final type = node['type'] as String? ?? 'Node';
    final children = (node['children'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    if (children.isEmpty) {
      return Padding(
        padding: EdgeInsets.only(left: depth * 16.0, bottom: 4),
        child: ListTile(
          dense: true,
          contentPadding: EdgeInsets.zero,
          leading: const Icon(Icons.person, size: 20, color: AppColors.primary),
          title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
          subtitle: Text(type, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        ),
      );
    }

    return Padding(
      padding: EdgeInsets.only(left: depth * 16.0),
      child: ExpansionTile(
        tilePadding: EdgeInsets.zero,
        leading: Icon(
          type == 'company' ? Icons.business : type == 'branch' ? Icons.account_tree : Icons.group,
          size: 20,
          color: AppColors.primary,
        ),
        title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
        subtitle: Text(type, style: const TextStyle(fontSize: 11, color: AppColors.textSecondary)),
        children: children.map((c) => _buildNode(c, depth + 1)).toList(),
      ),
    );
  }
}
