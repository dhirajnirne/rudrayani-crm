import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'tracking_task.dart';

/// UI-side control of the background tracking foreground service.
/// Punch-in starts it, punch-out stops it (brief §10: explicit, not implicit).
class TrackingService {
  /// Call once in main() before runApp.
  static void initCommunicationPort() => FlutterForegroundTask.initCommunicationPort();

  /// Notification + location permissions. The service is started while the
  /// app is in the foreground, so a `location`-type foreground service keeps
  /// GPS access in the background with plain while-in-use permission —
  /// no "Allow all the time" settings trip needed.
  static Future<String?> ensurePermissions() async {
    await FlutterForegroundTask.requestNotificationPermission();

    if (!await Geolocator.isLocationServiceEnabled()) {
      return 'Turn on device location (GPS) to punch in.';
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      return 'Location permission is required to punch in. Enable it in app settings.';
    }
    return null;
  }

  static Future<Position> currentPosition() => Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 30),
        ),
      );

  static Future<void> start({required int pingIntervalSeconds}) async {
    FlutterForegroundTask.init(
      androidNotificationOptions: AndroidNotificationOptions(
        channelId: 'rudrayani_tracking',
        channelName: 'Duty location tracking',
        channelDescription: 'Shown while you are punched in',
      ),
      iosNotificationOptions: const IOSNotificationOptions(),
      foregroundTaskOptions: ForegroundTaskOptions(
        eventAction: ForegroundTaskEventAction.repeat(pingIntervalSeconds * 1000),
        allowWakeLock: true,
        autoRunOnBoot: false,
      ),
    );
    if (await FlutterForegroundTask.isRunningService) return;
    await FlutterForegroundTask.startService(
      serviceId: 100,
      serviceTypes: [ForegroundServiceTypes.location],
      notificationTitle: 'On duty — location tracking active',
      notificationText: 'Rudrayani CRM records your route until you punch out',
      callback: startTrackingCallback,
    );
  }

  static Future<void> stop() async {
    if (await FlutterForegroundTask.isRunningService) {
      await FlutterForegroundTask.stopService();
    }
  }

  static Future<bool> get isRunning => FlutterForegroundTask.isRunningService;
}
