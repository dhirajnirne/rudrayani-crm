import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/widgets/state_views.dart';
import 'reminders_provider.dart';

final _dateTime = DateFormat('dd MMM, HH:mm');

/// Full list of every upcoming pending reminder — the Today section's hero
/// card only ever shows today's; this is the standalone More-menu screen.
class RemindersScreen extends ConsumerWidget {
  const RemindersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final reminders = ref.watch(upcomingRemindersProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Reminders'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(upcomingRemindersProvider),
          ),
        ],
      ),
      body: reminders.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: 'Could not load reminders.',
          onRetry: () => ref.invalidate(upcomingRemindersProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(icon: Icons.notifications_none, message: 'No upcoming reminders');
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(upcomingRemindersProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: list.length,
              itemBuilder: (ctx, i) {
                final r = list[i];
                final remindAt = DateTime.parse(r['remind_at'] as String).toLocal();
                final customerName = r['customer_name'] as String?;
                final note = r['note'] as String?;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: const Icon(Icons.notifications_active, color: AppColors.warning),
                    title: Text(customerName ?? (note?.isNotEmpty == true ? note! : 'Reminder')),
                    subtitle: Text(
                      [
                        _dateTime.format(remindAt),
                        if (customerName != null && note?.isNotEmpty == true) note,
                      ].join(' · '),
                      style: const TextStyle(fontSize: 12).tabular,
                    ),
                    trailing: IconButton(
                      icon: const Icon(Icons.check_circle_outline),
                      tooltip: 'Mark done',
                      onPressed: () async {
                        try {
                          await ref.read(remindersControllerProvider).markDone(r['id'] as String);
                        } catch (_) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('Could not update — try again when online')),
                            );
                          }
                        }
                      },
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
