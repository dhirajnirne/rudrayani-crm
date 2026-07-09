import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/notifications/notification_service.dart';
import '../../core/offline/offline_queue.dart';

/// Reminders due today (pending), IST day window handled server-side.
final remindersTodayProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  final today = DateTime.now().toIso8601String().substring(0, 10);
  final res = await api.get<Map<String, dynamic>>(
    '/reminders',
    query: {'date': today, 'status': 'pending'},
  );
  return (res.data!['reminders'] as List).cast<Map<String, dynamic>>();
});

/// PTPs due today or overdue — the pre-existing promise-to-pay "reminder"
/// mechanism (brief §6), shown alongside manual reminders in the Today
/// section so an agent has one place to see everything due.
final ptpsDueTodayProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/ptps/due');
  return (res.data!['ptps'] as List).cast<Map<String, dynamic>>();
});

/// Every future pending reminder for this agent — used to reschedule local
/// notifications on app start (a fresh install / reinstalled app has no
/// scheduled alarms yet; a device reboot clears the OS's alarm list too).
final upcomingRemindersProvider = FutureProvider<List<Map<String, dynamic>>>((
  ref,
) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>(
    '/reminders',
    query: {'status': 'pending', 'from': DateTime.now().toIso8601String()},
  );
  return (res.data!['reminders'] as List).cast<Map<String, dynamic>>();
});

class RemindersController {
  final Ref ref;
  RemindersController(this.ref);

  /// Creates a reminder. Online: posts immediately and schedules the device
  /// notification from the server-confirmed row. Offline: queues the create
  /// (synced later via the offline queue) but still schedules the
  /// notification right away from the locally-known values, so it fires on
  /// time even if sync hasn't happened yet.
  Future<void> create({
    String? customerId,
    required DateTime remindAt,
    String? note,
    required String notificationTitle,
  }) async {
    final clientKey = OfflineQueueNotifier.newClientKey();
    final api = ref.read(apiClientProvider);
    final payload = {
      if (customerId != null) 'customer_id': customerId,
      'remind_at': remindAt.toUtc().toIso8601String(),
      if (note != null && note.isNotEmpty) 'note': note,
      'client_key': clientKey,
    };

    try {
      final res = await api.post<Map<String, dynamic>>(
        '/reminders',
        data: payload,
      );
      final reminder = res.data!['reminder'] as Map<String, dynamic>;
      await NotificationService.scheduleReminder(
        reminderId: reminder['id'] as String,
        remindAt: remindAt,
        title: notificationTitle,
        body: note?.isNotEmpty == true ? note! : 'Follow-up reminder',
      );
    } catch (e) {
      if (!isOfflineError(e)) rethrow;
      await ref
          .read(offlineQueueProvider.notifier)
          .enqueue(
            QueuedAction(
              clientKey: clientKey,
              type: 'reminder',
              payload: payload,
              createdAt: DateTime.now(),
            ),
          );
      // client_key doubles as the local notification id until the server
      // row syncs and gets a real id.
      await NotificationService.scheduleReminder(
        reminderId: clientKey,
        remindAt: remindAt,
        title: notificationTitle,
        body: note?.isNotEmpty == true ? note! : 'Follow-up reminder',
      );
    }

    ref.invalidate(remindersTodayProvider);
    ref.invalidate(upcomingRemindersProvider);
  }

  Future<void> markDone(String reminderId) async {
    await ref
        .read(apiClientProvider)
        .patch('/reminders/$reminderId', data: {'status': 'done'});
    await NotificationService.cancelReminder(reminderId);
    ref.invalidate(remindersTodayProvider);
    ref.invalidate(upcomingRemindersProvider);
  }
}

final remindersControllerProvider = Provider((ref) => RemindersController(ref));

/// Cancels every scheduled local notification and reschedules from the
/// server's current pending list — call once after login/session restore.
/// Caps at 50 (Android's per-app alarm budget is generous but not infinite,
/// and an agent with more than 50 future reminders needs a list, not alarms).
Future<void> rescheduleAllReminders(WidgetRef ref) async {
  await NotificationService.cancelAll();
  final upcoming = await ref.refresh(upcomingRemindersProvider.future);
  for (final r in upcoming.take(50)) {
    final remindAt = DateTime.parse(r['remind_at'] as String).toLocal();
    final customerName = r['customer_name'] as String?;
    await NotificationService.scheduleReminder(
      reminderId: r['id'] as String,
      remindAt: remindAt,
      title: customerName != null ? 'Reminder: $customerName' : 'Reminder',
      body: (r['note'] as String?)?.isNotEmpty == true
          ? r['note'] as String
          : 'Follow-up due',
    );
  }
}
