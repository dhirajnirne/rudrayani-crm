import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/offline/offline_queue.dart';

final attachmentsProvider =
    FutureProvider.family<List<Map<String, dynamic>>, String>((
      ref,
      customerId,
    ) async {
      final api = ref.watch(apiClientProvider);
      final res = await api.get<Map<String, dynamic>>(
        '/attachments',
        query: {'customer_id': customerId},
      );
      return (res.data!['attachments'] as List).cast<Map<String, dynamic>>();
    });

class AttachmentsController {
  final Ref ref;
  AttachmentsController(this.ref);

  /// Photos can queue offline (same pattern as payment/field-visit photos):
  /// copied to a durable path, posted via the offline queue on reconnect.
  Future<bool> uploadPhoto({
    required String customerId,
    required String photoPath,
    String? note,
  }) async {
    final clientKey = OfflineQueueNotifier.newClientKey();
    final payload = {
      'customer_id': customerId,
      if (note != null && note.isNotEmpty) 'note': note,
      'client_key': clientKey,
    };
    final api = ref.read(apiClientProvider);
    final form = FormData.fromMap({
      ...payload,
      'file': await MultipartFile.fromFile(photoPath, filename: 'photo.jpg'),
    });

    try {
      await api.postForm('/attachments', form);
      ref.invalidate(attachmentsProvider(customerId));
      return true;
    } catch (e) {
      if (!isOfflineError(e)) rethrow;
      final durablePath = await OfflineQueueNotifier.persistPhoto(photoPath);
      await ref
          .read(offlineQueueProvider.notifier)
          .enqueue(
            QueuedAction(
              clientKey: clientKey,
              type: 'attachment',
              payload: payload,
              photoPath: durablePath,
              createdAt: DateTime.now(),
            ),
          );
      return false; // queued, not yet synced
    }
  }

  /// PDFs require connectivity (no offline queueing in v1 — avoids copying
  /// large files into the queue dir and a second queued-type code path for
  /// what should be a rare, deliberate upload).
  Future<void> uploadPdf({
    required String customerId,
    required File file,
    String? note,
  }) async {
    final api = ref.read(apiClientProvider);
    final form = FormData.fromMap({
      'customer_id': customerId,
      if (note != null && note.isNotEmpty) 'note': note,
      'client_key': OfflineQueueNotifier.newClientKey(),
      'file': await MultipartFile.fromFile(
        file.path,
        filename: file.path.split(Platform.pathSeparator).last,
      ),
    });
    await api.postForm('/attachments', form);
    ref.invalidate(attachmentsProvider(customerId));
  }
}

final attachmentsControllerProvider = Provider(
  (ref) => AttachmentsController(ref),
);
