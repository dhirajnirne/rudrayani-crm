class DispositionCode {
  final String id;
  final String actionCode;
  final String resultCode;
  final String description;
  // FV (field visit) or OC (on-call) -- null for legacy/custom codes an
  // admin hasn't tagged yet; those are excluded from both channel lists in
  // the call-log picker until an admin assigns one (see DispositionsPage).
  final String? channel;
  final bool needsAmount;
  final bool needsDate;
  final bool needsTime;
  final bool needsMode;
  final bool needsReason;
  final bool needsNameRelation;

  const DispositionCode({
    required this.id,
    required this.actionCode,
    required this.resultCode,
    required this.description,
    this.channel,
    required this.needsAmount,
    required this.needsDate,
    required this.needsTime,
    required this.needsMode,
    required this.needsReason,
    required this.needsNameRelation,
  });

  factory DispositionCode.fromJson(Map<String, dynamic> j) => DispositionCode(
        id: j['id'] as String,
        actionCode: j['action_code'] as String,
        resultCode: (j['result_code'] as String?) ?? '',
        description: (j['description'] as String?) ?? '',
        channel: j['channel'] as String?,
        needsAmount: j['needs_amount'] == true,
        needsDate: j['needs_date'] == true,
        needsTime: j['needs_time'] == true,
        needsMode: j['needs_mode'] == true,
        needsReason: j['needs_reason'] == true,
        needsNameRelation: j['needs_name_relation'] == true,
      );

  String get display => '${actionCode}_$resultCode — $description';
}
