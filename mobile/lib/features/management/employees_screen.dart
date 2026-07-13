import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';

final employeesListProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/employees');
  return (res.data['users'] as List?) ?? [];
});

class EmployeesScreen extends ConsumerWidget {
  const EmployeesScreen({super.key});

  Future<void> _toggleStatus(BuildContext context, WidgetRef ref, String userId, bool currentStatus) async {
    final endpoint = currentStatus ? '/users/$userId/deactivate' : '/users/$userId/activate';
    try {
      await ref.read(apiClientProvider).post(endpoint);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('User status updated'),
            backgroundColor: AppColors.success,
          ),
        );
      }
      ref.invalidate(employeesListProvider);
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: const Text('Could not update status — try again'),
            backgroundColor: AppColors.error,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final employeesAsync = ref.watch(employeesListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Employees'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => ref.invalidate(employeesListProvider)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(employeesListProvider),
        child: employeesAsync.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Failed to load employees.\n$e', onRetry: () => ref.invalidate(employeesListProvider)),
          data: (users) {
            if (users.isEmpty) {
              return const Center(child: Text('No employees found'));
            }
            return ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: users.length,
              itemBuilder: (ctx, i) {
                final u = users[i] as Map<String, dynamic>;
                final id = u['id'] as String;
                final name = u['full_name'] as String? ?? 'Unknown';
                final isActive = u['is_active'] == true;
                final capabilities = (u['capabilities'] as List?)?.cast<String>() ?? [];

                return Card(
                  margin: const EdgeInsets.only(bottom: AppSpacing.sm),
                  child: ListTile(
                    title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                    subtitle: Padding(
                      padding: const EdgeInsets.only(top: 4.0),
                      child: Wrap(
                        spacing: 4,
                        runSpacing: 4,
                        children: capabilities.map((c) => Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primarySurface,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(c, style: const TextStyle(fontSize: 10, color: AppColors.primaryDark)),
                        )).toList(),
                      ),
                    ),
                    trailing: PopupMenuButton<String>(
                      onSelected: (val) {
                        if (val == 'toggle') {
                          _toggleStatus(context, ref, id, isActive);
                        }
                      },
                      itemBuilder: (ctx) => [
                        PopupMenuItem(
                          value: 'toggle',
                          child: Text(isActive ? 'Deactivate' : 'Activate'),
                        ),
                      ],
                    ),
                    leading: CircleAvatar(
                      backgroundColor: isActive ? AppColors.successContainer : AppColors.neutralContainer,
                      child: Icon(
                        Icons.person,
                        color: isActive ? AppColors.successStrong : AppColors.textSecondary,
                      ),
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
