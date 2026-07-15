import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/tracking/attendance_provider.dart';
import '../../core/theme/app_theme.dart';

class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authProvider);
    final user = auth.user;
    final capabilities = auth.capabilities;
    final att = ref.watch(attendanceProvider);
    final attNotifier = ref.read(attendanceProvider.notifier);
    
    final isManager = capabilities.contains('agency_admin') ||
        capabilities.contains('operations_manager') ||
        capabilities.contains('team_leader');
    final isAdmin = capabilities.contains('agency_admin') ||
        capabilities.contains('operations_manager');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Account'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Profile Info
          Row(
            children: [
              CircleAvatar(
                radius: 32,
                backgroundColor: AppColors.primary,
                child: Text(
                  (user?['full_name'] ?? 'U')[0].toUpperCase(),
                  style: const TextStyle(fontSize: 24, color: AppColors.onPrimary),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      user?['full_name'] ?? 'Agent',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                    ),
                    Text(
                      user?['email'] ?? '',
                      style: const TextStyle(color: AppColors.textSecondary),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          
          // Punch Out
          Card(
            color: att.punchedIn ? AppColors.successContainer : AppColors.neutralContainer,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(
                        att.punchedIn ? Icons.gps_fixed : Icons.gps_off,
                        color: att.punchedIn ? AppColors.successStrong : AppColors.textSecondary,
                      ),
                      const SizedBox(width: 8),
                      Text(
                        att.punchedIn ? 'On Duty' : 'Off Duty',
                        style: TextStyle(
                          fontWeight: FontWeight.bold,
                          color: att.punchedIn ? AppColors.successStrong : AppColors.textSecondary,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  SizedBox(
                    width: double.infinity,
                    height: AppDimens.tapTarget,
                    child: ElevatedButton(
                      onPressed: att.punchedIn && !att.busy
                          ? () => attNotifier.punchOut()
                          : null,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.error,
                        foregroundColor: AppColors.onPrimary,
                      ),
                      child: att.busy
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Punch Out'),
                    ),
                  ),
                ],
              ),
            ),
          ),
          
          if (isManager) ...[
            const SizedBox(height: 24),
            const Text('Management', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            ListTile(
              leading: const Icon(Icons.people),
              title: const Text('All Customers'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/customers'),
            ),
            ListTile(
              leading: const Icon(Icons.badge),
              title: const Text('Employees'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/employees'),
            ),
            ListTile(
              leading: const Icon(Icons.groups),
              title: const Text('Teams'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/teams'),
            ),
          ],
          
          if (isAdmin) ...[
            ListTile(
              leading: const Icon(Icons.business),
              title: const Text('Branches'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/branches'),
            ),
            ListTile(
              leading: const Icon(Icons.domain),
              title: const Text('Companies'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/companies'),
            ),
            ListTile(
              leading: const Icon(Icons.category),
              title: const Text('Catalog'),
              subtitle: const Text('Products, Buckets, Dispositions'),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.push('/account/catalog'),
            ),
          ],
        ],
      ),
    );
  }
}
