import 'package:dio/dio.dart';
import 'package:flutter_foreground_task/flutter_foreground_task.dart';
import 'package:geolocator/geolocator.dart';
import 'package:intl/intl.dart';
import '../api/api_client.dart';

/// Entry point for the foreground-service isolate. Must be a top-level
/// function kept by the AOT compiler, hence the pragma.
@pragma('vm:entry-point')
void startTrackingCallback() {
  FlutterForegroundTask.setTaskHandler(TrackingTaskHandler());
}

/// Captures a GPS ping on every repeat tick (interval comes from
/// /api/location/config, default 2 min — brief §9) and posts it. Pings that
/// fail to send (offline) stay in [_pending] and ride along with the next
/// batch — the server ignores duplicates on (user_id, recorded_at).
class TrackingTaskHandler extends TaskHandler {
  final Dio _dio = buildDio();
  final List<Map<String, dynamic>> _pending = [];

  static const _maxPending = 300; // ~10 hours at 2-min pings

  Future<void> _capturePing() async {
    try {
      final pos = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 30),
        ),
      );
      _pending.add({
        'recorded_at': pos.timestamp.toUtc().toIso8601String(),
        'lat': pos.latitude,
        'lng': pos.longitude,
        'accuracy_meters': pos.accuracy,
      });
    } catch (_) {
      // GPS unavailable this tick (indoors, timeout) — try again next tick.
    }
    if (_pending.isEmpty) return;
    if (_pending.length > _maxPending) {
      _pending.removeRange(0, _pending.length - _maxPending);
    }
    try {
      await _dio.post('/location/pings', data: {'pings': List.of(_pending)});
      _pending.clear();
      FlutterForegroundTask.updateService(
        notificationText:
            'Last ping ${DateFormat('HH:mm').format(DateTime.now())} — punch out to stop',
      );
    } catch (_) {
      // Offline — keep the batch and retry on the next tick.
      FlutterForegroundTask.updateService(
        notificationText: '${_pending.length} ping(s) queued, will sync when online',
      );
    }
  }

  @override
  Future<void> onStart(DateTime timestamp, TaskStarter starter) async {
    await _capturePing();
  }

  @override
  void onRepeatEvent(DateTime timestamp) {
    _capturePing();
  }

  @override
  Future<void> onDestroy(DateTime timestamp, bool isTimeout) async {
    // Best-effort flush of anything still queued when the shift ends.
    if (_pending.isNotEmpty) {
      try {
        await _dio.post('/location/pings', data: {'pings': List.of(_pending)});
        _pending.clear();
      } catch (_) {
        // Lost only if still offline at punch-out; acceptable for Task 4.2 —
        // the durable offline queue arrives with Task 4.3.
      }
    }
  }
}
