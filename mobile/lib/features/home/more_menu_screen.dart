import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../../core/auth/auth_provider.dart';
import '../../core/theme/app_theme.dart';

/// More menu — role-specific list of standalone screens (PTPs, Payment History, etc.)
/// Phase 1 placeholder: screens TBD.
class MoreMenuScreen extends ConsumerWidget {
  final String role; // 'telecaller', 'field_agent', 'team_leader'
  const MoreMenuScreen({super.key, required this.role});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final items = _itemsForRole(role);

    return Scaffold(
      appBar: AppBar(
        title: const Text('More'),
      ),
      body: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: items.length + 1,
        itemBuilder: (ctx, i) {
          if (i == items.length) {
            return Padding(
              padding: const EdgeInsets.all(16),
              child: ElevatedButton.icon(
                icon: const Icon(Icons.logout),
                label: const Text('Log Out'),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.error,
                  foregroundColor: AppColors.onPrimary,
                ),
                onPressed: () => _confirmLogout(context, ref),
              ),
            );
          }
          final item = items[i];
          return Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ListTile(
              leading: Icon(item['icon'] as IconData),
              title: Text(item['label'] as String),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => _handleTap(context, item),
            ),
          );
        },
      ),
    );
  }

  List<Map<String, dynamic>> _itemsForRole(String role) {
    final common = [
      {
        'label': 'PTPs',
        'icon': Icons.calendar_today,
        'route': '/more/ptps',
      },
      {
        'label': 'Reminders',
        'icon': Icons.notifications,
        'route': '/more/reminders',
      },
      {
        'label': 'Correction Request',
        'icon': Icons.edit,
        'route': '/more/correction-request',
      },
    ];

    if (role == 'field_agent') {
      return common; // Field Agent doesn't show Payment History (collected in Field Visit)
    }

    return [
      {
        'label': 'Payment History',
        'icon': Icons.history,
        'route': '/more/payment-history',
      },
      ...common,
    ];
  }

  void _handleTap(BuildContext context, Map<String, dynamic> item) {
    final route = item['route'] as String;
    context.push(route);
  }

  Future<void> _confirmLogout(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (ok == true && context.mounted) {
      await ref.read(authProvider.notifier).logout();
      if (context.mounted) context.go('/login');
    }
  }
}
