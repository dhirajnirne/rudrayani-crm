import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/state_views.dart';

final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _date = DateFormat('dd MMM yyyy');

/// All/Pending/Kept/Broken filter over every PTP visible to the caller
/// (self-scoped for agents, agency-wide for TL+ — same GET /ptps the
/// per-customer PtpsScreen uses, just without a customer_id).
final allPtpsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String?>((ref, status) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/ptps', query: {
    if (status != null) 'status': status,
  });
  return (res.data!['ptps'] as List).cast<Map<String, dynamic>>();
});

class AllPtpsScreen extends ConsumerStatefulWidget {
  const AllPtpsScreen({super.key});

  @override
  ConsumerState<AllPtpsScreen> createState() => _AllPtpsScreenState();
}

class _AllPtpsScreenState extends ConsumerState<AllPtpsScreen> {
  String? _status; // null = All

  static const _filters = [
    (null, 'All'),
    ('pending', 'Pending'),
    ('kept', 'Kept'),
    ('broken', 'Broken'),
  ];

  Color _statusColor(String status) => switch (status) {
        'kept' => AppColors.success,
        'broken' => AppColors.error,
        _ => AppColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    final ptps = ref.watch(allPtpsProvider(_status));

    return Scaffold(
      appBar: AppBar(
        title: const Text('PTPs'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(allPtpsProvider(_status)),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  for (final (value, label) in _filters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(label),
                        selected: _status == value,
                        onSelected: (_) => setState(() => _status = value),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: ptps.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                message: 'Could not load PTPs.',
                onRetry: () => ref.invalidate(allPtpsProvider(_status)),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return const EmptyState(icon: Icons.calendar_today, message: 'No PTPs found');
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
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
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
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
                                  Text(
                                    '${ptp['customer_name']} · ${ptp['loan_number']}',
                                    style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  if (amount != null)
                                    Text(_rupee.format(amount), style: const TextStyle(fontSize: 13).tabular),
                                  if (promised != null)
                                    Text(
                                      'Due: ${_date.format(promised)}${isOverdue ? ' ⚠ Overdue' : ''}',
                                      style: TextStyle(
                                        fontSize: 12,
                                        color: isOverdue ? AppColors.error : AppColors.textTertiary,
                                      ).tabular,
                                    ),
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
          ),
        ],
      ),
    );
  }
}
