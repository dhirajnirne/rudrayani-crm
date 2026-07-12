// Pure filtering/validation functions behind the shared disposition picker
// (mobile redesign phase 1 — moved out of the retired call_log_screen.dart
// into disposition_flow.dart so both Customer Detail (Telecaller) and Field
// Visit (Field Agent) can reuse them). Channel-switch reset and dynamic-field
// visibility are covered by widget tests on the screens that embed
// DispositionFields instead of here.
import 'package:flutter_test/flutter_test.dart';

import 'package:rudrayani_mobile/core/models/disposition_code.dart';
import 'package:rudrayani_mobile/features/worklist/disposition_flow.dart';

DispositionCode _code({
  required String id,
  String? channel,
  String actionCode = 'OC',
  String resultCode = 'PTP',
  String description = 'Promise to Pay',
  bool needsAmount = false,
  bool needsDate = false,
  bool needsMode = false,
  bool needsReason = false,
  bool needsNameRelation = false,
}) =>
    DispositionCode(
      id: id,
      actionCode: actionCode,
      resultCode: resultCode,
      description: description,
      channel: channel,
      needsAmount: needsAmount,
      needsDate: needsDate,
      needsTime: false,
      needsMode: needsMode,
      needsReason: needsReason,
      needsNameRelation: needsNameRelation,
    );

void main() {
  group('codesForChannel', () {
    final codes = [
      _code(id: '1', channel: 'FV', description: 'Field visit made'),
      _code(id: '2', channel: 'OC', description: 'Called, no answer'),
      _code(id: '3', channel: 'FV', description: 'Door locked'),
    ];

    test('FV selection returns only FV codes', () {
      final result = codesForChannel(codes, 'FV');
      expect(result.map((c) => c.id), ['1', '3']);
    });

    test('OC selection excludes FV codes entirely', () {
      final result = codesForChannel(codes, 'OC');
      expect(result.map((c) => c.id), ['2']);
      expect(result.any((c) => c.channel == 'FV'), isFalse);
    });

    test('codes without a channel (legacy/custom) appear in neither list', () {
      final unset = _code(id: '4', channel: null, description: 'Custom code');
      final all = [...codes, unset];
      expect(codesForChannel(all, 'FV').any((c) => c.id == '4'), isFalse);
      expect(codesForChannel(all, 'OC').any((c) => c.id == '4'), isFalse);
    });
  });

  group('missingSteps (submission gating)', () {
    test('blocks submission when no channel is selected', () {
      final missing = missingSteps(
        channel: null,
        code: null,
        hasAmount: false,
        hasDate: false,
        hasMode: false,
        hasReason: false,
        hasNameRelation: false,
      );
      expect(missing, ['channel']);
    });

    test('blocks submission when channel is selected but no code yet', () {
      final missing = missingSteps(
        channel: 'OC',
        code: null,
        hasAmount: false,
        hasDate: false,
        hasMode: false,
        hasReason: false,
        hasNameRelation: false,
      );
      expect(missing, ['result code']);
    });

    test("blocks submission until the selected code's required fields are filled", () {
      final ptp = _code(id: '1', channel: 'OC', needsAmount: true, needsDate: true);
      final missing = missingSteps(
        channel: 'OC',
        code: ptp,
        hasAmount: false,
        hasDate: false,
        hasMode: false,
        hasReason: false,
        hasNameRelation: false,
      );
      expect(missing, containsAll(['amount', 'date']));
    });

    test('allows submission once channel, code, and required fields are satisfied', () {
      final ptp = _code(id: '1', channel: 'OC', needsAmount: true, needsDate: true);
      final missing = missingSteps(
        channel: 'OC',
        code: ptp,
        hasAmount: true,
        hasDate: true,
        hasMode: false,
        hasReason: false,
        hasNameRelation: false,
      );
      expect(missing, isEmpty);
    });

    test('a code with no needs_* flags requires nothing beyond channel + code', () {
      final callBack = _code(id: '2', channel: 'FV', description: 'Call back later');
      final missing = missingSteps(
        channel: 'FV',
        code: callBack,
        hasAmount: false,
        hasDate: false,
        hasMode: false,
        hasReason: false,
        hasNameRelation: false,
      );
      expect(missing, isEmpty); // remarks is optional, never listed
    });
  });

  group('ocCategoryFor', () {
    test('maps known result codes to the mockup categories', () {
      expect(ocCategoryFor(_code(id: '1', resultCode: 'CB')), 'Call Back');
      expect(ocCategoryFor(_code(id: '2', resultCode: 'DGPTP')), 'Promise to Pay');
      expect(ocCategoryFor(_code(id: '3', resultCode: 'WKPTP')), 'Promise to Pay');
      expect(ocCategoryFor(_code(id: '4', resultCode: 'PTP')), 'Promise to Pay');
      expect(ocCategoryFor(_code(id: '5', resultCode: 'PAID')), 'Resolved');
      expect(ocCategoryFor(_code(id: '6', resultCode: 'PP')), 'Resolved');
      expect(ocCategoryFor(_code(id: '7', resultCode: 'RTP')), 'Refuse to Pay');
      expect(ocCategoryFor(_code(id: '8', resultCode: 'NC')), 'Not Contactable');
      expect(ocCategoryFor(_code(id: '9', resultCode: 'RNR')), 'Not Contactable');
    });

    test('unrecognised agency-configured codes fall back to Other rather than being hidden', () {
      expect(ocCategoryFor(_code(id: '10', resultCode: 'CUSTOM99')), 'Other');
    });
  });
}
