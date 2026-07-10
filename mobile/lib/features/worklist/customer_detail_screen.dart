import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';
import '../attachments/attachments_section.dart';
import '../reminders/reminder_sheet.dart';
import 'customer_detail_provider.dart';
import 'history_timeline.dart';
import 'worklist_provider.dart';

final _rupee = NumberFormat.currency(
  locale: 'en_IN',
  symbol: '₹',
  decimalDigits: 0,
);

/// Resolves the customer by id before rendering — the screen navigates by
/// id only (not the whole Customer object) so it survives an app restart or
/// a cold deep link into `/customer/:id`.
class CustomerDetailScreen extends ConsumerWidget {
  final String customerId;

  const CustomerDetailScreen({super.key, required this.customerId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final customerAsync = ref.watch(customerByIdProvider(customerId));
    return customerAsync.when(
      data: (customer) => _CustomerDetailBody(customer: customer),
      loading: () => Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
        ),
        body: const Center(child: CircularProgressIndicator()),
      ),
      error: (err, _) => Scaffold(
        appBar: AppBar(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
        ),
        body: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.error_outline, size: 40, color: Colors.grey),
              const SizedBox(height: 8),
              const Text('Could not load this customer'),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => ref.invalidate(customerByIdProvider(customerId)),
                child: const Text('Retry'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _CustomerDetailBody extends ConsumerWidget {
  final Customer customer;

  const _CustomerDetailBody({required this.customer});

  Future<void> _dial(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: customer.mobileNumber);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('Cannot open dialer')));
      }
    }
  }

  /// The address arrives through the import's custom fields — find the
  /// first address-looking column and hand it to the maps app.
  String? get _address {
    for (final e in customer.customFields.entries) {
      final k = e.key.toLowerCase();
      if ((k.contains('address') || k.contains('addr')) &&
          (e.value?.toString().trim().isNotEmpty ?? false)) {
        return e.value.toString().trim();
      }
    }
    return null;
  }

  Future<void> _navigate(BuildContext context) async {
    final address = _address;
    if (address == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No address on file for this customer')),
      );
      return;
    }
    final uri = Uri.parse('geo:0,0?q=${Uri.encodeComponent(address)}');
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      if (context.mounted) {
        ScaffoldMessenger.of(
          context,
        ).showSnackBar(const SnackBar(content: Text('No maps app available')));
      }
    }
  }

  Future<void> _requestReallocation(BuildContext context, WidgetRef ref) async {
    final reasonCtrl = TextEditingController();
    final reason = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Request Reallocation'),
        content: TextField(
          controller: reasonCtrl,
          maxLines: 3,
          autofocus: true,
          decoration: const InputDecoration(
            labelText: 'Why should this customer be moved? *',
            border: OutlineInputBorder(),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, reasonCtrl.text.trim()),
            child: const Text('Submit'),
          ),
        ],
      ),
    );
    if (reason == null || reason.length < 3) return;

    try {
      await ref
          .read(apiClientProvider)
          .post(
            '/reallocation-requests',
            data: {'customer_id': customer.id, 'reason': reason},
          );
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Request sent — your team leader will review it'),
            backgroundColor: Colors.green,
          ),
        );
      }
    } on DioException catch (e) {
      if (context.mounted) {
        final msg = e.response?.statusCode == 409
            ? 'A request is already pending for this customer'
            : 'Could not send the request — check your connection';
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text(customer.customerName),
        actions: [
          PopupMenuButton<String>(
            onSelected: (v) {
              if (v == 'realloc') _requestReallocation(context, ref);
            },
            itemBuilder: (ctx) => const [
              PopupMenuItem(
                value: 'realloc',
                child: ListTile(
                  leading: Icon(Icons.swap_horiz),
                  title: Text('Request Reallocation'),
                  contentPadding: EdgeInsets.zero,
                ),
              ),
            ],
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async =>
            ref.invalidate(customerDetailProvider(customer.id)),
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Call & action buttons
              Row(
                children: [
                  Expanded(
                    child: ElevatedButton.icon(
                      icon: const Icon(Icons.call),
                      label: Text(customer.mobileNumber),
                      onPressed: () => _dial(context),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: Colors.green,
                        foregroundColor: Colors.white,
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.note_add),
                      label: const Text('Log Call'),
                      onPressed: () =>
                          context.push('/customer/${customer.id}/call-log'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.payment),
                      label: const Text('Record Payment'),
                      onPressed: () =>
                          context.push('/customer/${customer.id}/payment'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.calendar_today),
                      label: const Text('View PTPs'),
                      onPressed: () =>
                          context.push('/customer/${customer.id}/ptps'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.assignment_turned_in),
                      label: const Text('Field Visit'),
                      onPressed: () => context
                          .push('/customer/${customer.id}/field-visit'),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.directions),
                      label: const Text('Navigate'),
                      onPressed: () => _navigate(context),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      icon: const Icon(Icons.notifications_active_outlined),
                      label: const Text('Set Reminder'),
                      onPressed: () =>
                          showReminderSheet(context, ref, customer: customer),
                      style: OutlinedButton.styleFrom(
                        minimumSize: const Size(0, 48),
                      ),
                    ),
                  ),
                  const SizedBox(width: 8),
                  const Expanded(child: SizedBox()),
                ],
              ),
              const SizedBox(height: 16),
              if (customer.normalizedPending)
                Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 12,
                    vertical: 8,
                  ),
                  decoration: BoxDecoration(
                    color: Colors.blue.withValues(alpha: 0.08),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: Colors.blue.withValues(alpha: 0.3),
                    ),
                  ),
                  child: const Row(
                    children: [
                      Icon(Icons.info_outline, size: 16, color: Colors.blue),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Normalized this month, pending lender confirmation. The lender\'s bucket stays authoritative until their next file confirms it.',
                          style: TextStyle(fontSize: 12, color: Colors.blue),
                        ),
                      ),
                    ],
                  ),
                ),
              // Loan details card
              _SectionCard(
                title: 'Loan Details',
                children: [
                  _Row('Loan Number', customer.loanNumber),
                  _Row('Company', customer.companyName),
                  if (customer.product != null)
                    _Row('Product', customer.product!),
                  if (customer.bucket != null) _Row('Bucket', customer.bucket!),
                  if (customer.dueAmount != null)
                    _Row('Due Amount', _rupee.format(customer.dueAmount)),
                  if (customer.emi != null)
                    _Row('EMI', _rupee.format(customer.emi)),
                ],
              ),
              const SizedBox(height: 12),
              // Last disposition
              if (customer.lastRemark != null)
                _SectionCard(
                  title: 'Last Disposition',
                  children: [
                    if (customer.lastResultCode != null)
                      _Row('Result', customer.lastResultCode!),
                    if (customer.lastCallAt != null)
                      _Row(
                        'When',
                        DateFormat(
                          'dd MMM yyyy HH:mm',
                        ).format(customer.lastCallAt!.toLocal()),
                      ),
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 4),
                      child: Text(
                        customer.lastRemark!,
                        style: const TextStyle(fontSize: 13),
                      ),
                    ),
                  ],
                ),
              // PTP reminder
              if (customer.ptpDate != null)
                _SectionCard(
                  title: 'Active PTP',
                  children: [
                    _Row('Amount', _rupee.format(customer.ptpAmount)),
                    _Row(
                      'Promised Date',
                      DateFormat('dd MMM yyyy').format(customer.ptpDate!),
                    ),
                  ],
                ),
              // Custom fields
              if (customer.customFields.isNotEmpty)
                _SectionCard(
                  title: 'Additional Fields',
                  children: [
                    for (final e in customer.customFields.entries)
                      _Row(e.key, e.value?.toString() ?? '—'),
                  ],
                ),
              const SizedBox(height: 12),
              AttachmentsSection(customerId: customer.id),
              const SizedBox(height: 12),
              HistoryTimeline(customerId: customer.id),
            ],
          ),
        ),
      ),
    );
  }
}

class _SectionCard extends StatelessWidget {
  final String title;
  final List<Widget> children;
  const _SectionCard({required this.title, required this.children});

  @override
  Widget build(BuildContext context) => Card(
    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    child: Padding(
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 14,
              color: AppColors.primary,
            ),
          ),
          const Divider(),
          ...children,
        ],
      ),
    ),
  );
}

class _Row extends StatelessWidget {
  final String label;
  final String value;
  const _Row(this.label, this.value);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 2),
    child: Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SizedBox(
          width: 120,
          child: Text(
            label,
            style: const TextStyle(color: Colors.grey, fontSize: 12),
          ),
        ),
        Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
      ],
    ),
  );
}
