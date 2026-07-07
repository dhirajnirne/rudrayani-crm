import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';
import '../../core/offline/offline_queue.dart';
import '../worklist/worklist_provider.dart';

class PaymentScreen extends ConsumerStatefulWidget {
  final Customer customer;
  const PaymentScreen({super.key, required this.customer});

  @override
  ConsumerState<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends ConsumerState<PaymentScreen> {
  final _amountCtrl = TextEditingController();
  final _dateCtrl = TextEditingController();
  String? _mode;
  File? _photo;
  bool _closeCustomer = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _amountCtrl.dispose();
    _dateCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto(ImageSource source) async {
    final picker = ImagePicker();
    final xfile = await picker.pickImage(source: source, imageQuality: 80, maxWidth: 1920);
    if (xfile != null) setState(() => _photo = File(xfile.path));
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now,
    );
    if (picked != null) _dateCtrl.text = DateFormat('yyyy-MM-dd').format(picked);
  }

  Future<void> _submit() async {
    if (_amountCtrl.text.isEmpty) { setState(() => _error = 'Amount is required'); return; }
    final amount = double.tryParse(_amountCtrl.text);
    if (amount == null || amount <= 0) { setState(() => _error = 'Enter a valid positive amount'); return; }

    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiClientProvider);
      // One key for both paths: a lost response must not double-record money.
      final payload = <String, dynamic>{
        'customer_id': widget.customer.id,
        'amount': amount,
        if (_mode != null) 'mode': _mode,
        if (_dateCtrl.text.isNotEmpty) 'paid_at': _dateCtrl.text,
        'close_customer': _closeCustomer.toString(),
        'client_key': OfflineQueueNotifier.newClientKey(),
      };
      final form = FormData.fromMap({
        ...payload,
        if (_photo != null)
          'photo': await MultipartFile.fromFile(_photo!.path,
              filename: 'proof.jpg', contentType: DioMediaType('image', 'jpeg')),
      });

      try {
        await api.postForm('/payments', form);
      } catch (e) {
        if (!isOfflineError(e)) rethrow;
        // No network — persist the photo outside the picker cache and queue.
        final photoPath =
            _photo != null ? await OfflineQueueNotifier.persistPhoto(_photo!.path) : null;
        await ref.read(offlineQueueProvider.notifier).enqueue(QueuedAction(
              clientKey: payload['client_key'] as String,
              type: 'payment',
              payload: payload,
              photoPath: photoPath,
              createdAt: DateTime.now(),
            ));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('No network — payment saved offline, will sync automatically'),
              backgroundColor: Colors.orange,
            ),
          );
          context.pop();
          if (_closeCustomer) context.pop();
        }
        return;
      }

      if (mounted) {
        ref.invalidate(worklistProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Payment recorded!'), backgroundColor: Colors.green),
        );
        context.pop();
        if (_closeCustomer) context.pop(); // also pop customer detail
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
        title: Text('Record Payment — ${widget.customer.customerName}'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _amountCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Amount Collected (₹) *',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.currency_rupee),
              ),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _mode,
              decoration: const InputDecoration(
                labelText: 'Payment Mode',
                border: OutlineInputBorder(),
              ),
              items: ['Cash', 'NEFT', 'RTGS', 'UPI', 'Cheque', 'DD']
                  .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                  .toList(),
              onChanged: (v) => setState(() => _mode = v),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _dateCtrl,
              readOnly: true,
              decoration: const InputDecoration(
                labelText: 'Payment Date',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.calendar_today),
                hintText: 'Today if blank',
              ),
              onTap: _pickDate,
            ),
            const SizedBox(height: 16),
            // Photo proof
            const Text('Photo Proof', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
            const SizedBox(height: 8),
            if (_photo != null) ...[
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Image.file(_photo!, height: 200, fit: BoxFit.cover),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                icon: const Icon(Icons.delete),
                label: const Text('Remove photo'),
                onPressed: () => setState(() => _photo = null),
                style: TextButton.styleFrom(foregroundColor: Colors.red),
              ),
            ] else ...[
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
            ],
            const SizedBox(height: 16),
            // Close customer toggle
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Mark customer as Closed'),
              subtitle: const Text('Clears assignment and sets status to closed', style: TextStyle(fontSize: 12)),
              value: _closeCustomer,
              onChanged: (v) => setState(() => _closeCustomer = v),
              activeThumbColor: const Color(0xFF00535B),
            ),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            const SizedBox(height: 8),
            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                icon: _loading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(_loading ? 'Saving…' : 'Record Payment'),
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
