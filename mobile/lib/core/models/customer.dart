class Customer {
  final String id;
  final String loanNumber;
  final String customerName;
  final String mobileNumber;
  final String? product;
  final String? bucket;
  final double? dueAmount;
  final double? emi;
  final Map<String, dynamic> customFields;
  final String companyName;
  final String? lastRemark;
  final DateTime? lastCallAt;
  final String? lastResultCode;
  final double? ptpAmount;
  final DateTime? ptpDate;
  // Phase 7: worklist already filters to status='active' server-side, so
  // these mostly matter for forward-compatibility (e.g. a future screen that
  // lists customers regardless of status) and for the normalized badge.
  final String status;
  final DateTime? recalledAt;
  final bool normalizedPending;

  const Customer({
    required this.id,
    required this.loanNumber,
    required this.customerName,
    required this.mobileNumber,
    this.product,
    this.bucket,
    this.dueAmount,
    this.emi,
    required this.customFields,
    required this.companyName,
    this.lastRemark,
    this.lastCallAt,
    this.lastResultCode,
    this.ptpAmount,
    this.ptpDate,
    this.status = 'active',
    this.recalledAt,
    this.normalizedPending = false,
  });

  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: j['id'] as String,
        loanNumber: j['loan_number'] as String,
        customerName: j['customer_name'] as String,
        mobileNumber: (j['mobile_number'] as String?) ?? '',
        product: j['product'] as String?,
        bucket: j['bucket'] as String?,
        dueAmount: (j['due_amount'] as num?)?.toDouble(),
        emi: (j['emi'] as num?)?.toDouble(),
        customFields: (j['custom_fields'] as Map<String, dynamic>?) ?? {},
        companyName: j['company_name'] as String,
        lastRemark: j['last_remark'] as String?,
        lastCallAt: j['last_call_at'] != null ? DateTime.parse(j['last_call_at'] as String) : null,
        lastResultCode: j['last_result_code'] as String?,
        ptpAmount: (j['ptp_amount'] as num?)?.toDouble(),
        ptpDate: j['ptp_date'] != null ? DateTime.parse(j['ptp_date'] as String) : null,
        status: j['status'] as String? ?? 'active',
        recalledAt: j['recalled_at'] != null ? DateTime.parse(j['recalled_at'] as String) : null,
        normalizedPending: j['normalized_pending'] as bool? ?? false,
      );
}
