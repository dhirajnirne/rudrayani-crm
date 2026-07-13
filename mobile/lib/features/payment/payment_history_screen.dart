import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/state_views.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _date = DateFormat('dd MMM yyyy, HH:mm');

/// Every payment the caller has personally collected, across all customers
/// (self-scoped server-side — see GET /payments without customer_id).
final paymentHistoryProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/payments');
  return (res.data!['payments'] as List).cast<Map<String, dynamic>>();
});

class PaymentHistoryScreen extends ConsumerWidget {
  const PaymentHistoryScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final payments = ref.watch(paymentHistoryProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment History'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(paymentHistoryProvider),
          ),
        ],
      ),
      body: payments.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ErrorState(
          message: 'Could not load payment history.',
          onRetry: () => ref.invalidate(paymentHistoryProvider),
        ),
        data: (list) {
          if (list.isEmpty) {
            return const EmptyState(icon: Icons.history, message: 'No payments recorded yet');
          }
          return RefreshIndicator(
            onRefresh: () async => ref.invalidate(paymentHistoryProvider),
            child: ListView.builder(
              padding: const EdgeInsets.all(AppSpacing.md),
              itemCount: list.length,
              itemBuilder: (ctx, i) {
                final p = list[i];
                final amount = (p['amount'] as num?)?.toDouble() ?? 0;
                final paidAt = p['paid_at'] != null ? DateTime.parse(p['paid_at'] as String).toLocal() : null;
                return Card(
                  margin: const EdgeInsets.only(bottom: 8),
                  child: ListTile(
                    leading: Icon(
                      p['has_photo'] == true ? Icons.receipt_long : Icons.payments_outlined,
                      color: AppColors.success,
                    ),
                    title: Text(
                      '${p['customer_name']} · ${p['loan_number']}',
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                    subtitle: Text(
                      [
                        if (paidAt != null) _date.format(paidAt),
                        if (p['mode'] != null) p['mode'] as String,
                      ].join(' · '),
                      style: const TextStyle(fontSize: 12),
                    ),
                    trailing: Text(
                      _rupee.format(amount),
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14).tabular,
                    ),
                  ),
                );
              },
            ),
          );
        },
      ),
    );
  }
}
