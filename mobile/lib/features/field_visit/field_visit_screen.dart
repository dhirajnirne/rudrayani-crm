import 'dart:io';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:signature/signature.dart';

import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';
import '../../core/offline/offline_queue.dart';

/// Field-visit evidence (brief §8): a photo of the visit, the customer's
/// signature drawn on screen, an optional remark, and the GPS point.
class FieldVisitScreen extends ConsumerStatefulWidget {
  final Customer customer;
  const FieldVisitScreen({super.key, required this.customer});

  @override
  ConsumerState<FieldVisitScreen> createState() => _FieldVisitScreenState();
}

class _FieldVisitScreenState extends ConsumerState<FieldVisitScreen> {
  final _remarkCtrl = TextEditingController();
  final _signatureCtrl = SignatureController(
    penStrokeWidth: 3,
    penColor: Colors.black,
    exportBackgroundColor: Colors.white,
  );
  File? _photo;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _remarkCtrl.dispose();
    _signatureCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final xfile = await ImagePicker()
        .pickImage(source: source, imageQuality: 80, maxWidth: 1920);
    if (xfile != null) setState(() => _photo = File(xfile.path));
  }

  Future<Position?> _tryGps() async {
    try {
      return await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          accuracy: LocationAccuracy.high,
          timeLimit: Duration(seconds: 10),
        ),
      );
    } catch (_) {
      return Geolocator.getLastKnownPosition();
    }
  }

  Future<void> _submit() async {
    final hasSignature = _signatureCtrl.isNotEmpty;
    if (_photo == null && !hasSignature) {
      setState(() => _error = 'Add a photo or take the customer\'s signature');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      final Uint8List? signaturePng =
          hasSignature ? await _signatureCtrl.toPngBytes() : null;
      final pos = await _tryGps();

      // One key for both paths (direct send / offline queue).
      final payload = <String, dynamic>{
        'customer_id': widget.customer.id,
        if (_remarkCtrl.text.trim().isNotEmpty) 'remark': _remarkCtrl.text.trim(),
        if (pos != null) 'lat': pos.latitude,
        if (pos != null) 'lng': pos.longitude,
        'client_key': OfflineQueueNotifier.newClientKey(),
      };

      final api = ref.read(apiClientProvider);
      try {
        final form = FormData.fromMap({
          ...payload,
          if (_photo != null)
            'photo': await MultipartFile.fromFile(_photo!.path,
                filename: 'visit.jpg', contentType: DioMediaType('image', 'jpeg')),
          if (signaturePng != null)
            'signature': MultipartFile.fromBytes(signaturePng,
                filename: 'signature.png', contentType: DioMediaType('image', 'png')),
        });
        await api.postForm('/field-visits', form);
      } catch (e) {
        if (!isOfflineError(e)) rethrow;
        final photoPath =
            _photo != null ? await OfflineQueueNotifier.persistPhoto(_photo!.path) : null;
        final signaturePath = signaturePng != null
            ? await OfflineQueueNotifier.persistBytes(signaturePng, 'png')
            : null;
        await ref.read(offlineQueueProvider.notifier).enqueue(QueuedAction(
              clientKey: payload['client_key'] as String,
              type: 'field_visit',
              payload: payload,
              photoPath: photoPath,
              signaturePath: signaturePath,
              createdAt: DateTime.now(),
            ));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('No network — visit saved offline, will sync automatically'),
              backgroundColor: Colors.orange,
            ),
          );
          context.pop();
        }
        return;
      }

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Field visit recorded!'), backgroundColor: Colors.green),
        );
        context.pop();
      }
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('DioException', '').trim());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF00535B),
        foregroundColor: Colors.white,
        title: Text('Field Visit — ${widget.customer.customerName}'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('Visit Photo', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 8),
            if (_photo != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.file(_photo!, height: 180, fit: BoxFit.cover),
              ),
              TextButton.icon(
                icon: const Icon(Icons.delete),
                label: const Text('Remove photo'),
                onPressed: () => setState(() => _photo = null),
                style: TextButton.styleFrom(foregroundColor: Colors.red),
              ),
            ] else
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.camera_alt),
                      label: const Text('Camera'),
                      onPressed: () => _pickPhoto(ImageSource.camera),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.photo_library),
                      label: const Text('Gallery'),
                      onPressed: () => _pickPhoto(ImageSource.gallery),
                      style: OutlinedButton.styleFrom(minimumSize: const Size(0, 48)),
                    ),
                  ),
                ],
              ),
            const SizedBox(height: 16),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Customer Signature',
                    style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                TextButton(
                  onPressed: () => _signatureCtrl.clear(),
                  child: const Text('Clear', style: TextStyle(fontSize: 12)),
                ),
              ],
            ),
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade400),
                borderRadius: BorderRadius.circular(8),
              ),
              clipBehavior: Clip.antiAlias,
              child: Signature(
                controller: _signatureCtrl,
                height: 160,
                backgroundColor: Colors.white,
              ),
            ),
            const SizedBox(height: 16),
            TextField(
              controller: _remarkCtrl,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Remark (optional)',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 12),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                icon: _loading
                    ? const SizedBox(
                        width: 18, height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(_loading ? 'Saving…' : 'Save Visit'),
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF00535B),
                  foregroundColor: Colors.white,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
