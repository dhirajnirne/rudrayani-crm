import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/disposition_code.dart';
import '../../core/theme/app_theme.dart';

/// Result codes available for a given channel — only codes tagged for the
/// channel picked in step 1 (custom codes an admin hasn't tagged with a
/// channel yet are excluded from both lists until they are). Pure function
/// so the filtering behaviour is unit-testable without pumping the whole
/// widget tree (see disposition_flow_test.dart).
List<DispositionCode> codesForChannel(
  List<DispositionCode> codes,
  String channel,
) {
  return codes.where((c) => c.channel == channel).toList();
}

/// Which required steps of the flow (Channel -> Result Code -> Dynamic
/// Fields) are still missing, in the order they should be resolved. Remarks
/// is optional, so it never appears here. Pure function so "submission
/// blocked until satisfied" is unit-testable independent of the widget tree.
List<String> missingSteps({
  required String? channel,
  required DispositionCode? code,
  required bool hasAmount,
  required bool hasDate,
  required bool hasMode,
  required bool hasReason,
  required bool hasNameRelation,
}) {
  if (channel == null) return const ['channel'];
  if (code == null) return const ['result code'];
  final missing = <String>[];
  if (code.needsAmount && !hasAmount) missing.add('amount');
  if (code.needsDate && !hasDate) missing.add('date');
  if (code.needsMode && !hasMode) missing.add('payment mode');
  if (code.needsReason && !hasReason) missing.add('reason');
  if (code.needsNameRelation && !hasNameRelation) missing.add('name/relation');
  return missing;
}

/// Presentational grouping of OC codes into the mockup's 5 categories (Call
/// Back / Promise to Pay / Resolved / Refuse to Pay / Not Contactable),
/// derived from the code's own result_code. Disposition codes are
/// agency-configurable on the backend, so an unrecognised result_code falls
/// back to "Other" rather than being hidden.
String ocCategoryFor(DispositionCode c) {
  switch (c.resultCode) {
    case 'CB':
      return 'Call Back';
    case 'DGPTP':
    case 'WKPTP':
    case 'PTP':
      return 'Promise to Pay';
    case 'PAID':
    case 'PP':
      return 'Resolved';
    case 'RTP':
      return 'Refuse to Pay';
    case 'NC':
    case 'RNR':
      return 'Not Contactable';
    default:
      return 'Other';
  }
}

const _ocCategoryOrder = [
  'Call Back',
  'Promise to Pay',
  'Resolved',
  'Refuse to Pay',
  'Not Contactable',
  'Other',
];

/// A validated disposition ready to submit: the channel, the chosen code,
/// the dynamic fields it required, and the composed remark preview.
class DispositionSelection {
  final String channel;
  final DispositionCode code;
  final Map<String, dynamic> fields;
  final String remark;
  const DispositionSelection({
    required this.channel,
    required this.code,
    required this.fields,
    required this.remark,
  });
}

/// Self-contained channel + result-code + dynamic-fields picker. Reports its
/// current (possibly incomplete) state via [onChanged] on every edit —
/// `null` until channel + code + all required dynamic fields are filled.
/// Callers own the actual submit action (Customer Detail submits a
/// disposition standalone; Field Visit bundles it with a photo and payment).
class DispositionFields extends StatefulWidget {
  final List<String> allowedChannels; // ['OC', 'FV'] or a single fixed value
  final List<DispositionCode> codes;
  final ValueChanged<DispositionSelection?> onChanged;

  const DispositionFields({
    super.key,
    required this.allowedChannels,
    required this.codes,
    required this.onChanged,
  });

  @override
  State<DispositionFields> createState() => DispositionFieldsState();
}

class DispositionFieldsState extends State<DispositionFields> {
  String? _channel;
  String? _codeId;
  final _amountCtrl = TextEditingController();
  final _dateCtrl = TextEditingController();
  final _timeCtrl = TextEditingController();
  final _modeCtrl = TextEditingController();
  final _reasonCtrl = TextEditingController();
  final _nameRelCtrl = TextEditingController();
  final _extraCtrl = TextEditingController();
  String _remarkPreview = '';

  @override
  void initState() {
    super.initState();
    if (widget.allowedChannels.length == 1) {
      _channel = widget.allowedChannels.first;
    }
  }

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

  List<DispositionCode> get _channelCodes =>
      _channel == null ? const [] : codesForChannel(widget.codes, _channel!);

  DispositionCode? get _selectedCode {
    final id = _codeId;
    if (id == null) return null;
    for (final c in _channelCodes) {
      if (c.id == id) return c;
    }
    return null;
  }

  void _selectChannel(String channel) {
    setState(() {
      _channel = channel;
      _codeId = null;
      _amountCtrl.clear();
      _dateCtrl.clear();
      _timeCtrl.clear();
      _modeCtrl.clear();
      _reasonCtrl.clear();
      _nameRelCtrl.clear();
      _remarkPreview = '';
    });
    _emit();
  }

  void _selectCode(String id) {
    setState(() {
      _codeId = id;
      _amountCtrl.clear();
      _dateCtrl.clear();
      _timeCtrl.clear();
      _modeCtrl.clear();
      _reasonCtrl.clear();
      _nameRelCtrl.clear();
    });
    _updatePreview();
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

  void _updatePreview() {
    final code = _selectedCode;
    if (code == null) {
      setState(() => _remarkPreview = '');
      _emit();
      return;
    }
    final parts = <String>[];
    if (code.needsAmount && _amountCtrl.text.isNotEmpty) {
      parts.add('₹${_amountCtrl.text}');
    }
    if (code.needsDate && _dateCtrl.text.isNotEmpty) parts.add(_dateCtrl.text);
    if (code.needsMode && _modeCtrl.text.isNotEmpty) parts.add(_modeCtrl.text);
    if (code.needsReason && _reasonCtrl.text.isNotEmpty) {
      parts.add(_reasonCtrl.text);
    }
    if (code.needsNameRelation && _nameRelCtrl.text.isNotEmpty) {
      parts.add(_nameRelCtrl.text);
    }
    final extra = _extraCtrl.text.isNotEmpty ? ' — ${_extraCtrl.text}' : '';
    setState(() => _remarkPreview = parts.join(' | ') + extra);
    _emit();
  }

  void _emit() {
    final code = _selectedCode;
    final missing = missingSteps(
      channel: _channel,
      code: code,
      hasAmount: _amountCtrl.text.isNotEmpty,
      hasDate: _dateCtrl.text.isNotEmpty,
      hasMode: _modeCtrl.text.isNotEmpty,
      hasReason: _reasonCtrl.text.isNotEmpty,
      hasNameRelation: _nameRelCtrl.text.isNotEmpty,
    );
    if (missing.isNotEmpty || code == null) {
      widget.onChanged(null);
      return;
    }
    final fields = <String, dynamic>{};
    if (code.needsAmount && _amountCtrl.text.isNotEmpty) {
      fields['amount'] = double.tryParse(_amountCtrl.text);
    }
    if (code.needsDate && _dateCtrl.text.isNotEmpty) {
      fields['date'] = _dateCtrl.text;
    }
    if (code.needsTime && _timeCtrl.text.isNotEmpty) {
      fields['time'] = _timeCtrl.text;
    }
    if (code.needsMode && _modeCtrl.text.isNotEmpty) {
      fields['mode'] = _modeCtrl.text;
    }
    if (code.needsReason && _reasonCtrl.text.isNotEmpty) {
      fields['reason'] = _reasonCtrl.text;
    }
    if (code.needsNameRelation && _nameRelCtrl.text.isNotEmpty) {
      fields['name_relation'] = _nameRelCtrl.text;
    }
    widget.onChanged(
      DispositionSelection(
        channel: _channel!,
        code: code,
        fields: fields,
        remark: _extraCtrl.text.isNotEmpty
            ? '$_remarkPreview'
            : _remarkPreview,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final selectedCode = _selectedCode;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (widget.allowedChannels.length > 1) ...[
          const Text(
            'Interaction Type',
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 8),
          SegmentedButton<String>(
            style: SegmentedButton.styleFrom(
              minimumSize: const Size(64, AppDimens.tapTarget),
            ),
            segments: widget.allowedChannels
                .map((c) => ButtonSegment(
                      value: c,
                      label: Text(c == 'OC' ? 'OC · Call' : 'FV · Field Visit'),
                    ))
                .toList(),
            selected: _channel == null ? const {} : {_channel!},
            emptySelectionAllowed: true,
            onSelectionChanged: (s) {
              if (s.isNotEmpty) _selectChannel(s.first);
            },
          ),
          const SizedBox(height: 16),
        ],
        if (_channel != null) ...[
          Text(
            'Select Disposition — $_channel Codes',
            style: const TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: AppColors.textSecondary),
          ),
          const SizedBox(height: 8),
          _CodeGrid(
            channel: _channel!,
            codes: _channelCodes,
            selectedId: _codeId,
            onSelect: _selectCode,
          ),
        ],
        if (selectedCode != null) ...[
          const SizedBox(height: 16),
          if (selectedCode.needsAmount) ...[
            TextField(
              controller: _amountCtrl,
              keyboardType: TextInputType.number,
              style: const TextStyle().tabular,
              decoration: const InputDecoration(
                labelText: 'Amount (₹) *',
                border: OutlineInputBorder(),
                prefixIcon: Icon(Icons.currency_rupee),
              ),
              onChanged: (_) => _updatePreview(),
            ),
            const SizedBox(height: 12),
          ],
          if (selectedCode.needsDate) ...[
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
          if (selectedCode.needsMode) ...[
            DropdownButtonFormField<String>(
              initialValue: _modeCtrl.text.isEmpty ? null : _modeCtrl.text,
              decoration: const InputDecoration(
                labelText: 'Payment Mode *',
                border: OutlineInputBorder(),
              ),
              items: ['UPI', 'NEFT', 'IMPS', 'RTGS', 'Cash', 'Cheque', 'DD']
                  .map((m) => DropdownMenuItem(value: m, child: Text(m)))
                  .toList(),
              onChanged: (v) {
                _modeCtrl.text = v ?? '';
                _updatePreview();
              },
            ),
            const SizedBox(height: 12),
          ],
          if (selectedCode.needsReason) ...[
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
          if (selectedCode.needsNameRelation) ...[
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
          TextField(
            controller: _extraCtrl,
            maxLines: 2,
            decoration: const InputDecoration(
              labelText: 'Remarks (optional)',
              border: OutlineInputBorder(),
            ),
            onChanged: (_) => _updatePreview(),
          ),
          if (_remarkPreview.isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.successContainer,
                borderRadius: BorderRadius.circular(AppRadius.md),
                border: Border.all(color: AppColors.success.withValues(alpha: 0.3)),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Remark Preview',
                    style: TextStyle(fontSize: 11, color: AppColors.successStrong, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 4),
                  Text(_remarkPreview, style: const TextStyle(fontSize: 13).tabular),
                ],
              ),
            ),
          ],
        ],
      ],
    );
  }
}

/// Codes grouped into the mockup's category headers for OC; a flat grid for
/// FV (the mockup shows FV codes without subgroups).
class _CodeGrid extends StatelessWidget {
  final String channel;
  final List<DispositionCode> codes;
  final String? selectedId;
  final ValueChanged<String> onSelect;
  const _CodeGrid({
    required this.channel,
    required this.codes,
    required this.selectedId,
    required this.onSelect,
  });

  @override
  Widget build(BuildContext context) {
    if (codes.isEmpty) {
      return Text(
        'No $channel codes configured yet',
        style: const TextStyle(fontSize: 12, color: AppColors.textTertiary),
      );
    }
    if (channel != 'OC') {
      return Wrap(spacing: 8, runSpacing: 8, children: [
        for (final c in codes) _CodeChip(code: c, selected: c.id == selectedId, onTap: () => onSelect(c.id)),
      ]);
    }
    final byCategory = <String, List<DispositionCode>>{};
    for (final c in codes) {
      byCategory.putIfAbsent(ocCategoryFor(c), () => []).add(c);
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final category in _ocCategoryOrder)
          if (byCategory[category]?.isNotEmpty ?? false) ...[
            Padding(
              padding: const EdgeInsets.only(top: 8, bottom: 6),
              child: Text(
                category,
                style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: AppColors.textTertiary),
              ),
            ),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final c in byCategory[category]!)
                _CodeChip(code: c, selected: c.id == selectedId, onTap: () => onSelect(c.id)),
            ]),
          ],
      ],
    );
  }
}

class _CodeChip extends StatelessWidget {
  final DispositionCode code;
  final bool selected;
  final VoidCallback onTap;
  const _CodeChip({required this.code, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppDimens.tapTarget),
      child: ChoiceChip(
        label: Text('${code.resultCode} · ${code.description}'),
        selected: selected,
        onSelected: (_) => onTap(),
        selectedColor: AppColors.primary,
        labelStyle: TextStyle(
          color: selected ? AppColors.onPrimary : null,
          fontWeight: selected ? FontWeight.w600 : FontWeight.normal,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      ),
    );
  }
}
