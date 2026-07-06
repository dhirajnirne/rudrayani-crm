import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../api/api_client.dart';

/// Durable offline queue for money-critical actions (brief §8: "queue actions
/// locally, sync when connectivity returns"). Each item carries a client_key
/// UUID; the server answers a re-send with the already-created row, so a
/// half-synced queue can always be flushed again safely.
class QueuedAction {
  final String clientKey;
  final String type; // 'call_log' | 'payment' | 'field_visit'
  final Map<String, dynamic> payload;
  final String? photoPath; // durable copy for queued payments/visits
  final DateTime createdAt;

  QueuedAction({
    required this.clientKey,
    required this.type,
    required this.payload,
    this.photoPath,
    required this.createdAt,
  });

  Map<String, dynamic> toJson() => {
        'client_key': clientKey,
        'type': type,
        'payload': payload,
        'photo_path': photoPath,
        'created_at': createdAt.toIso8601String(),
      };

  // Items queued before 2026-07-06 may still carry a 'signature_path' key
  // (signature capture removed) — it is simply ignored here.
  factory QueuedAction.fromJson(Map<String, dynamic> j) => QueuedAction(
        clientKey: j['client_key'] as String,
        type: j['type'] as String,
        payload: Map<String, dynamic>.from(j['payload'] as Map),
        photoPath: j['photo_path'] as String?,
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}

class OfflineQueueState {
  final int pending;
  final bool syncing;
  final String? lastError; // last permanent rejection, shown once to the agent

  const OfflineQueueState({this.pending = 0, this.syncing = false, this.lastError});

  OfflineQueueState copyWith({int? pending, bool? syncing, String? lastError}) =>
      OfflineQueueState(
        pending: pending ?? this.pending,
        syncing: syncing ?? this.syncing,
        lastError: lastError,
      );
}

class OfflineQueueNotifier extends StateNotifier<OfflineQueueState> {
  final Ref ref;
  Box<String>? _box;
  static const _uuid = Uuid();

  OfflineQueueNotifier(this.ref) : super(const OfflineQueueState()) {
    _init();
  }

  Future<void> _init() async {
    await Hive.initFlutter();
    _box = await Hive.openBox<String>('offline_actions');
    state = state.copyWith(pending: _box!.length);
    // Flush whenever connectivity comes back (and once at startup).
    Connectivity().onConnectivityChanged.listen((results) {
      if (results.any((r) => r != ConnectivityResult.none)) flush();
    });
    flush();
  }

  static String newClientKey() => _uuid.v4();

  /// Copies a picked photo out of the image_picker cache (which the OS may
  /// clear) into the app documents dir so a queued payment keeps its proof.
  static Future<String> persistPhoto(String cachePath) async {
    final dir = await getApplicationDocumentsDirectory();
    final ext = cachePath.split('.').last;
    final dest = '${dir.path}/queued_${_uuid.v4()}.$ext';
    await File(cachePath).copy(dest);
    return dest;
  }

  Future<void> enqueue(QueuedAction action) async {
    await _box?.put(action.clientKey, jsonEncode(action.toJson()));
    state = state.copyWith(pending: _box?.length ?? 0);
  }

  /// Sends everything in FIFO order. Stops on network failure (still
  /// offline); drops items the server permanently rejects (4xx) so one bad
  /// record can't block the queue, surfacing the reason once.
  Future<void> flush() async {
    final box = _box;
    if (box == null || box.isEmpty || state.syncing) return;
    state = state.copyWith(syncing: true);
    final api = ref.read(apiClientProvider);

    try {
      final items = box.values
          .map((s) => QueuedAction.fromJson(jsonDecode(s) as Map<String, dynamic>))
          .toList()
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

      String? rejection;
      for (final item in items) {
        try {
          if (item.type == 'call_log') {
            await api.post('/call-logs', data: item.payload);
          } else if (item.type == 'payment') {
            final form = FormData.fromMap({
              ...item.payload,
              if (item.photoPath != null && File(item.photoPath!).existsSync())
                'photo': await MultipartFile.fromFile(item.photoPath!, filename: 'proof.jpg'),
            });
            await api.postForm('/payments', form);
          } else if (item.type == 'field_visit') {
            final form = FormData.fromMap({
              ...item.payload,
              if (item.photoPath != null && File(item.photoPath!).existsSync())
                'photo': await MultipartFile.fromFile(item.photoPath!, filename: 'visit.jpg'),
            });
            await api.postForm('/field-visits', form);
          }
        } on DioException catch (e) {
          if (_isOffline(e)) return; // still offline — keep the rest queued
          // Permanent rejection (validation, closed customer, retired code):
          // drop it so the queue keeps moving, but tell the agent why.
          rejection =
              '${item.type == 'payment' ? 'Payment' : 'Call log'} could not sync: '
              '${e.response?.data?['error'] ?? e.response?.statusCode ?? e.message}';
        }
        await _remove(item);
      }
      if (rejection != null) state = state.copyWith(lastError: rejection);
    } finally {
      state = state.copyWith(
        pending: box.length,
        syncing: false,
        lastError: state.lastError,
      );
    }
  }

  Future<void> _remove(QueuedAction item) async {
    await _box?.delete(item.clientKey);
    if (item.photoPath != null) {
      try {
        await File(item.photoPath!).delete();
      } catch (_) {
        // already gone — nothing to clean up
      }
    }
    state = state.copyWith(pending: _box?.length ?? 0);
  }

  void clearError() => state = state.copyWith(lastError: null);

  static bool _isOffline(DioException e) =>
      e.type == DioExceptionType.connectionError ||
      e.type == DioExceptionType.connectionTimeout ||
      e.type == DioExceptionType.sendTimeout ||
      e.type == DioExceptionType.receiveTimeout ||
      (e.type == DioExceptionType.unknown && e.error is SocketException);
}

final offlineQueueProvider = StateNotifierProvider<OfflineQueueNotifier, OfflineQueueState>(
  (ref) => OfflineQueueNotifier(ref),
);

/// True when this Dio failure means "no connectivity" — the caller should
/// queue the action instead of showing an error.
bool isOfflineError(Object e) =>
    e is DioException && OfflineQueueNotifier._isOffline(e);
