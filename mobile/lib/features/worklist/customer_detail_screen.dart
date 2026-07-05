import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../core/models/customer.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

class CustomerDetailScreen extends StatelessWidget {
  final Customer customer;

  const CustomerDetailScreen({super.key, required this.customer});

  Future<void> _dial(BuildContext context) async {
    final uri = Uri(scheme: 'tel', path: customer.mobileNumber);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri);
    } else {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Cannot open dialer')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF00535B),
        foregroundColor: Colors.white,
        title: Text(customer.customerName),
      ),
      body: SingleChildScrollView(
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
                    onPressed: () => context.push('/call-log', extra: customer),
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
                    onPressed: () => context.push('/payment', extra: customer),
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
                    onPressed: () => context.push('/ptps', extra: customer),
                    style: OutlinedButton.styleFrom(
                      minimumSize: const Size(0, 48),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            // Loan details card
            _SectionCard(title: 'Loan Details', children: [
              _Row('Loan Number', customer.loanNumber),
              _Row('Company', customer.companyName),
              if (customer.product != null) _Row('Product', customer.product!),
              if (customer.bucket != null) _Row('Bucket', customer.bucket!),
              if (customer.dueAmount != null) _Row('Due Amount', _rupee.format(customer.dueAmount)),
              if (customer.emi != null) _Row('EMI', _rupee.format(customer.emi)),
            ]),
            const SizedBox(height: 12),
            // Last disposition
            if (customer.lastRemark != null)
              _SectionCard(title: 'Last Disposition', children: [
                if (customer.lastResultCode != null) _Row('Result', customer.lastResultCode!),
                if (customer.lastCallAt != null)
                  _Row('When', DateFormat('dd MMM yyyy HH:mm').format(customer.lastCallAt!.toLocal())),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Text(customer.lastRemark!, style: const TextStyle(fontSize: 13)),
                ),
              ]),
            // PTP reminder
            if (customer.ptpDate != null)
              _SectionCard(title: 'Active PTP', children: [
                _Row('Amount', _rupee.format(customer.ptpAmount)),
                _Row('Promised Date', DateFormat('dd MMM yyyy').format(customer.ptpDate!)),
              ]),
            // Custom fields
            if (customer.customFields.isNotEmpty)
              _SectionCard(
                title: 'Additional Fields',
                children: [
                  for (final e in customer.customFields.entries)
                    _Row(e.key, e.value?.toString() ?? '—'),
                ],
              ),
          ],
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
              Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF00535B))),
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
              child: Text(label, style: const TextStyle(color: Colors.grey, fontSize: 12)),
            ),
            Expanded(child: Text(value, style: const TextStyle(fontSize: 13))),
          ],
        ),
      );
}
