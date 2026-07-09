import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_timezone/flutter_timezone.dart';
import 'package:timezone/data/latest.dart' as tzdata;
import 'package:timezone/timezone.dart' as tz;

/// On-device (no Firebase) scheduling for reminder due-times. Using
/// AndroidScheduleMode.inexactAllowWhileIdle avoids Android 12+'s
/// SCHEDULE_EXACT_ALARM permission/Play policy friction — a few minutes of
/// slack on a follow-up reminder is an acceptable trade for not chasing a
/// special permission grant.
class NotificationService {
  static final _plugin = FlutterLocalNotificationsPlugin();
  static bool _initialized = false;

  static Future<void> init() async {
    if (_initialized) return;
    tzdata.initializeTimeZones();
    try {
      final name = await FlutterTimezone.getLocalTimezone();
      tz.setLocalLocation(tz.getLocation(name));
    } catch (_) {
      // Fall back to UTC if the platform timezone lookup fails; reminders
      // still fire, just without local-time-accurate scheduling.
    }

    const androidInit = AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidInit);
    await _plugin.initialize(initSettings);
    _initialized = true;
  }

  /// Android 13+ requires this runtime grant; older versions no-op it.
  static Future<void> requestPermission() async {
    await _plugin
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.requestNotificationsPermission();
  }

  static int _notificationId(String reminderId) =>
      reminderId.hashCode & 0x7fffffff;

  static Future<void> scheduleReminder({
    required String reminderId,
    required DateTime remindAt,
    required String title,
    required String body,
  }) async {
    if (remindAt.isBefore(DateTime.now())) return;
    await _plugin.zonedSchedule(
      _notificationId(reminderId),
      title,
      body,
      tz.TZDateTime.from(remindAt, tz.local),
      const NotificationDetails(
        android: AndroidNotificationDetails(
          'reminders',
          'Follow-up reminders',
          channelDescription: 'Reminders you set for customer follow-ups',
          importance: Importance.high,
          priority: Priority.high,
        ),
      ),
      androidScheduleMode: AndroidScheduleMode.inexactAllowWhileIdle,
      uiLocalNotificationDateInterpretation:
          UILocalNotificationDateInterpretation.absoluteTime,
    );
  }

  static Future<void> cancelReminder(String reminderId) =>
      _plugin.cancel(_notificationId(reminderId));

  static Future<void> cancelAll() => _plugin.cancelAll();
}
