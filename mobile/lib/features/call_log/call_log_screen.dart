import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';
import '../../core/models/disposition_code.dart';
import '../../core/offline/offline_queue.dart';
import '../worklist/worklist_provider.dart';

class CallLogScreen extends ConsumerStatefulWidget {
  final Customer customer;
  const CallLogScreen({super.key, required this.customer});

  @override
  ConsumerState<CallLogScreen> createState() => _CallLogScreenState();
}

class _CallLogScreenState extends ConsumerState<CallLogScreen> {
  DispositionCode? _selectedCode;
  final _amountCtrl = TextEditingController();
  final _dateCtrl = TextEditingController();
  final _timeCtrl = TextEditingController();
  final _modeCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  final _nameRelCtrl = TextEditingController();
  final _extraCtrl = TextEditingController();
  bool _loading = false;
  String? _error;
  String _remarkPreview = '';

  @override
  void dispose() {
    _amountCtrl.dispose();
    _dateCtrl.dispose();
    _timeCtrl.dispose();
    _modeCtrl.dispose();
    _reasonCtrl.dispose();
    _nameRelCtrl.dispose();
    _extraCtrl.dispose();
    super.dispose();
  }

  void _updatePreview() {
    if (_selectedCode == null) return;
    final parts = <String>[];
    if (_selectedCode!.needsAmount && _amountCtrl.text.isNotEmpty) {
      parts.add('₹${_amountCtrl.text}');
    }
    if (_selectedCode!.needsDate && _dateCtrl.text.isNotEmpty) { parts.add(_dateCtrl.text); }
    if (_selectedCode!.needsMode && _modeCtrl.text.isNotEmpty) { parts.add(_modeCtrl.text); }
    if (_selectedCode!.needsReason && _reasonCtrl.text.isNotEmpty) { parts.add(_reasonCtrl.text); }
    if (_selectedCode!.needsNameRelation && _nameRelCtrl.text.isNotEmpty) { parts.add(_nameRelCtrl.text); }
    final extra = _extraCtrl.text.isNotEmpty ? ' — ${_extraCtrl.text}' : '';
    setState(() => _remarkPreview = parts.join(' | ') + extra);
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 90)),
    );
    if (picked != null) {
      _dateCtrl.text = DateFormat('yyyy-MM-dd').format(picked);
      _updatePreview();
    }
  }

  Future<void> _submit() async {
    if (_selectedCode == null) {
      setState(() => _error = 'Select a disposition code');
      return;
    }

    // Validate required fields
    final code = _selectedCode!;
    if (code.needsAmount && _amountCtrl.text.isEmpty) {
      setState(() => _error = 'Amount is required');
      return;
    }
    if (code.needsDate && _dateCtrl.text.isEmpty) {
      setState(() => _error = 'Date is required');
      return;
    }
    if (code.needsMode && _modeCtrl.text.isEmpty) {
      setState(() => _error = 'Payment mode is required');
      return;
    }
    if (code.needsReason && _reasonCtrl.text.isEmpty) {
      setState(() => _error = 'Reason is required');
      return;
    }
    if (code.needsNameRelation && _nameRelCtrl.text.isEmpty) {
      setState(() => _error = 'Name/Relation is required');
      return;
    }

    setState(() { _loading = true; _error = null; });
    try {
      final api = ref.read(apiClientProvider);
      final fields = <String, dynamic>{};
      if (code.needsAmount && _amountCtrl.text.isNotEmpty) {
        fields['amount'] = double.parse(_amountCtrl.text);
      }
      if (code.needsDate && _dateCtrl.text.isNotEmpty) { fields['date'] = _dateCtrl.text; }
      if (code.needsTime && _timeCtrl.text.isNotEmpty) { fields['time'] = _timeCtrl.text; }
      if (code.needsMode && _modeCtrl.text.isNotEmpty) { fields['mode'] = _modeCtrl.text; }
      if (code.needsReason && _reasonCtrl.text.isNotEmpty) { fields['reason'] = _reasonCtrl.text; }
      if (code.needsNameRelation && _nameRelCtrl.text.isNotEmpty) {
        fields['name_relation'] = _nameRelCtrl.text;
      }

      // One key for both paths: if the request reached the server but the
      // response was lost, the queued re-send must reuse the same key.
      final payload = {
        'customer_id': widget.customer.id,
        'disposition_code_id': code.id,
        'fields': fields,
        if (_extraCtrl.text.isNotEmpty) 'extra_remark': _extraCtrl.text,
        'client_key': OfflineQueueNotifier.newClientKey(),
      };
      try {
        await api.post('/call-logs', data: payload);
      } catch (e) {
        if (!isOfflineError(e)) rethrow;
        // No network — queue it; the client_key makes the later sync safe.
        await ref.read(offlineQueueProvider.notifier).enqueue(QueuedAction(
              clientKey: payload['client_key'] as String,
              type: 'call_log',
              payload: payload,
              createdAt: DateTime.now(),
            ));
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('No network — call log saved offline, will sync automatically'),
              backgroundColor: Colors.orange,
            ),
          );
          context.pop();
        }
        return;
      }

      if (mounted) {
        ref.invalidate(worklistProvider);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Call log saved!'), backgroundColor: Colors.green),
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
    final codesAsync = ref.watch(dispositionCodesProvider);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF00535B),
        foregroundColor: Colors.white,
        title: Text('Log Call — ${widget.customer.customerName}'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Disposition picker
            codesAsync.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => Text('Error loading codes: $e'),
              data: (codes) {
                final dCodes = codes.map((c) => DispositionCode.fromJson(c)).toList();
                return DropdownButtonFormField<DispositionCode>(
                  isExpanded: true,
                  decoration: const InputDecoration(
                    labelText: 'Disposition Code *',
                    border: OutlineInputBorder(),
                  ),
                  items: dCodes.map((c) => DropdownMenuItem(
                    value: c,
                    child: Text('${c.actionCode}_${c.resultCode} — ${c.description}',
                        overflow: TextOverflow.ellipsis),
                  )).toList(),
                  onChanged: (c) {
                    setState(() { _selectedCode = c; _error = null; });
                    _updatePreview();
                  },
                );
              },
            ),
            if (_selectedCode != null) ...[
              const SizedBox(height: 16),
              // Dynamic required fields
              if (_selectedCode!.needsAmount) ...[
                TextField(
                  controller: _amountCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Amount (₹) *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.currency_rupee),
                  ),
                  onChanged: (_) => _updatePreview(),
                ),
                const SizedBox(height: 12),
              ],
              if (_selectedCode!.needsDate) ...[
                TextField(
                  controller: _dateCtrl,
                  readOnly: true,
                  decoration: const InputDecoration(
                    labelText: 'Date *',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.calendar_today),
                  ),
                  onTap: _pickDate,
                ),
                const SizedBox(height: 12),
              ],
              if (_selectedCode!.needsTime) ...[
                TextField(
                  controller: _timeCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Time (HH:MM)',
                    border: OutlineInputBorder(),
                    prefixIcon: Icon(Icons.access_time),
                  ),
                  onChanged: (_) => _updatePreview(),
                ),
                const SizedBox(height: 12),
              ],
              if (_selectedCode!.needsMode) ...[
                DropdownButtonFormField<String>(
                  decoration: const InputDecoration(
                    labelText: 'Payment Mode *',
                    border: OutlineInputBorder(),
                  ),
                  items: ['NEFT', 'RTGS', 'Cash', 'UPI', 'Cheque', 'DD']
                      .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                      .toList(),
                  onChanged: (v) {
                    _modeCtrl.text = v ?? '';
                    _updatePreview();
                  },
                ),
                const SizedBox(height: 12),
              ],
              if (_selectedCode!.needsReason) ...[
                TextField(
                  controller: _reasonCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Reason *',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => _updatePreview(),
                ),
                const SizedBox(height: 12),
              ],
              if (_selectedCode!.needsNameRelation) ...[
                TextField(
                  controller: _nameRelCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Name / Relation *',
                    border: OutlineInputBorder(),
                  ),
                  onChanged: (_) => _updatePreview(),
                ),
                const SizedBox(height: 12),
              ],
              // Extra free-text remark
              TextField(
                controller: _extraCtrl,
                maxLines: 2,
                decoration: const InputDecoration(
                  labelText: 'Additional Notes (optional)',
                  border: OutlineInputBorder(),
                ),
                onChanged: (_) => _updatePreview(),
              ),
              const SizedBox(height: 12),
              // Remark preview
              if (_remarkPreview.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: Colors.teal.shade50,
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: Colors.teal.shade200),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text('Remark Preview', style: TextStyle(fontSize: 11, color: Colors.teal, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      Text(_remarkPreview, style: const TextStyle(fontSize: 13)),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
              ],
            ],
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text(_error!, style: const TextStyle(color: Colors.red)),
              ),
            SizedBox(
              height: 48,
              child: ElevatedButton.icon(
                icon: _loading
                    ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                    : const Icon(Icons.save),
                label: Text(_loading ? 'Saving…' : 'Save Call Log'),
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
