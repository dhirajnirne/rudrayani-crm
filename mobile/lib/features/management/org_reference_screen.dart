import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final orgBranchesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/branches');
  return (res.data['branches'] as List?) ?? [];
});

final orgCompaniesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/companies');
  return (res.data['companies'] as List?) ?? [];
});

final orgTeamsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/teams');
  return (res.data['teams'] as List?) ?? [];
});

class OrgReferenceScreen extends ConsumerStatefulWidget {
  const OrgReferenceScreen({super.key});

  @override
  ConsumerState<OrgReferenceScreen> createState() => _OrgReferenceScreenState();
}

class _OrgReferenceScreenState extends ConsumerState<OrgReferenceScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Org Reference'),
        bottom: TabBar(
          controller: _tabController,
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
          tabs: const [
            Tab(text: 'Companies'),
            Tab(text: 'Branches'),
            Tab(text: 'Teams'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _GenericList(provider: orgCompaniesProvider, icon: Icons.business),
          _GenericList(provider: orgBranchesProvider, icon: Icons.account_tree),
          _GenericList(provider: orgTeamsProvider, icon: Icons.group),
        ],
      ),
    );
  }
}

class _GenericList extends ConsumerWidget {
  final AutoDisposeFutureProvider<List<dynamic>> provider;
  final IconData icon;

  const _GenericList({required this.provider, required this.icon});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final asyncList = ref.watch(provider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(provider),
      child: asyncList.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(message: 'Could not load this list.', onRetry: () => ref.invalidate(provider)),
        data: (list) {
          if (list.isEmpty) {
            return const Center(child: Text('No items found'));
          }
          return ListView.builder(
            padding: const EdgeInsets.all(AppSpacing.md),
            itemCount: list.length,
            itemBuilder: (ctx, i) {
              final item = list[i] as Map<String, dynamic>;
              final name = item['name'] as String? ?? 'Unknown';
              return Card(
                margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                child: ListTile(
                  leading: Icon(icon, color: AppColors.primary),
                  title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
