import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';
import 'tracking_service.dart';

class AttendanceState {
  final bool punchedIn;
  final DateTime? punchInAt;
  final bool busy;
  final String? error;

  const AttendanceState({
    this.punchedIn = false,
    this.punchInAt,
    this.busy = false,
    this.error,
  });

  AttendanceState copyWith({bool? punchedIn, DateTime? punchInAt, bool? busy, String? error}) =>
      AttendanceState(
        punchedIn: punchedIn ?? this.punchedIn,
        punchInAt: punchInAt ?? this.punchInAt,
        busy: busy ?? this.busy,
        error: error,
      );
}

/// Punch state + the tracking service that follows it (brief §10: punch-in
/// starts the tracking session, punch-out ends it — explicit in the UI).
class AttendanceNotifier extends StateNotifier<AttendanceState> {
  final Ref ref;
  AttendanceNotifier(this.ref) : super(const AttendanceState());

  ApiClient get _api => ref.read(apiClientProvider);

  Future<int> _pingIntervalSeconds() async {
    try {
      final res = await _api.get('/location/config');
      return (res.data['ping_interval_seconds'] as num).toInt();
    } catch (_) {
      return 120; // brief §9 default
    }
  }

  /// Reconcile app + service state with the server on startup: a reinstalled
  /// or force-stopped app resumes tracking if the shift is still open.
  Future<void> init() async {
    try {
      final res = await _api.get('/attendance/status');
      final punchedIn = res.data['punched_in'] == true;
      final punchInAt = punchedIn
          ? DateTime.tryParse(res.data['attendance']?['punch_in_at'] ?? '')
          : null;
      state = state.copyWith(punchedIn: punchedIn, punchInAt: punchInAt);

      final running = await TrackingService.isRunning;
      if (punchedIn && !running) {
        final err = await TrackingService.ensurePermissions();
        if (err == null) {
          await TrackingService.start(pingIntervalSeconds: await _pingIntervalSeconds());
        }
      } else if (!punchedIn && running) {
        await TrackingService.stop();
      }
    } catch (_) {
      // Offline at startup — leave state as-is; user can retry via the banner.
    }
  }

  Future<void> punchIn() async {
    state = state.copyWith(busy: true, error: null);
    try {
      final permError = await TrackingService.ensurePermissions();
      if (permError != null) {
        state = state.copyWith(busy: false, error: permError);
        return;
      }
      final pos = await TrackingService.currentPosition();
      final res = await _api.post('/attendance/punch-in', data: {
        'lat': pos.latitude,
        'lng': pos.longitude,
      });
      await TrackingService.start(pingIntervalSeconds: await _pingIntervalSeconds());
      state = state.copyWith(
        punchedIn: true,
        punchInAt: DateTime.tryParse(res.data['attendance']?['punch_in_at'] ?? ''),
        busy: false,
      );
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        // Server already has an open shift — adopt it and start tracking.
        await init();
        state = state.copyWith(busy: false);
      } else {
        state = state.copyWith(busy: false, error: 'Punch-in failed: ${e.message}');
      }
    } catch (e) {
      state = state.copyWith(busy: false, error: 'Punch-in failed: $e');
    }
  }

  Future<void> punchOut() async {
    state = state.copyWith(busy: true, error: null);
    try {
      final pos = await TrackingService.currentPosition();
      await _api.post('/attendance/punch-out', data: {
        'lat': pos.latitude,
        'lng': pos.longitude,
      });
      await TrackingService.stop();
      state = const AttendanceState();
    } on DioException catch (e) {
      if (e.response?.statusCode == 409) {
        // No open shift server-side — just stop the local service.
        await TrackingService.stop();
        state = const AttendanceState();
      } else {
        state = state.copyWith(busy: false, error: 'Punch-out failed: ${e.message}');
      }
    } catch (e) {
      state = state.copyWith(busy: false, error: 'Punch-out failed: $e');
    }
  }
}

final attendanceProvider = StateNotifierProvider<AttendanceNotifier, AttendanceState>(
  (ref) => AttendanceNotifier(ref),
);
