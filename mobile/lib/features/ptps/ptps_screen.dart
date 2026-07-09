import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _date = DateFormat('dd MMM yyyy');

final ptpListProvider = FutureProvider.family<List<Map<String, dynamic>>, String>((ref, customerId) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/ptps', query: {'customer_id': customerId});
  return (res.data!['ptps'] as List).cast<Map<String, dynamic>>();
});

class PtpsScreen extends ConsumerWidget {
  final Customer customer;
  const PtpsScreen({super.key, required this.customer});

  Color _statusColor(String status) => switch (status) {
        'kept' => Colors.green,
        'broken' => Colors.red,
        _ => Colors.orange,
      };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ptps = ref.watch(ptpListProvider(customer.id));

    return Scaffold(
      appBar: AppBar(
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        title: Text('PTPs — ${customer.customerName}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(ptpListProvider(customer.id)),
          ),
        ],
      ),
      body: ptps.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
        data: (list) {
          if (list.isEmpty) {
            return const Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.calendar_today, size: 48, color: Colors.grey),
                  SizedBox(height: 8),
                  Text('No PTPs for this customer'),
                ],
              ),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            itemBuilder: (ctx, i) {
              final ptp = list[i];
              final status = ptp['status'] as String;
              final amount = (ptp['amount'] as num?)?.toDouble();
              final promised = ptp['promised_date'] != null
                  ? DateTime.parse(ptp['promised_date'] as String)
                  : null;
              final isOverdue = promised != null &&
                  status == 'pending' &&
                  promised.isBefore(DateTime.now());

              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                        decoration: BoxDecoration(
                          color: _statusColor(status).withAlpha(25),
                          borderRadius: BorderRadius.circular(4),
                          border: Border.all(color: _statusColor(status)),
                        ),
                        child: Text(
                          status.toUpperCase(),
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.bold,
                            color: _statusColor(status),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            if (amount != null)
                              Text(
                                _rupee.format(amount),
                                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                              ),
                            if (promised != null)
                              Text(
                                'Due: ${_date.format(promised)}${isOverdue ? ' ⚠ Overdue' : ''}',
                                style: TextStyle(
                                  fontSize: 12,
                                  color: isOverdue ? Colors.red : Colors.grey,
                                ),
                              ),
                            if (ptp['mode'] != null)
                              Text('Mode: ${ptp["mode"]}', style: const TextStyle(fontSize: 12)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
