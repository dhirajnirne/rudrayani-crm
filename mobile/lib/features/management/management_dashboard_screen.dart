import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../dashboard/dashboard_widgets.dart';

String _lakh(num? v) {
  if (v == null) return '—';
  final l = v / 100000;
  if (l.abs() >= 0.01) return '${l.toStringAsFixed(2)}L';
  return NumberFormat.decimalPattern('en_IN').format(v);
}

final mgtDashboardProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/dashboard', query: {'month': month});
  return res.data as Map<String, dynamic>;
});

final mgtTrailProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final now = DateTime.now();
  final res = await ref.read(apiClientProvider).get('/reports/trail', query: {
    'from': DateFormat('yyyy-MM-01').format(now),
    'to': DateFormat('yyyy-MM-dd').format(now),
  });
  return res.data as Map<String, dynamic>;
});

final mgtAgentsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/agents', query: {'month': month});
  return (res.data['agents'] as List?) ?? [];
});

final mgtTrendProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final now = DateTime.now();
  final res = await ref.read(apiClientProvider).get('/reports/trend', query: {
    'granularity': 'day',
    'from': DateFormat('yyyy-MM-dd').format(now.subtract(const Duration(days: 6))),
    'to': DateFormat('yyyy-MM-dd').format(now),
  });
  return (res.data['points'] as List?) ?? [];
});

final mgtEmployeesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/employees', query: {'is_active': 'true'});
  return (res.data['users'] as List?) ?? [];
});

final mgtCustomersProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/customers', query: {'status': 'active', 'limit': '1'});
  return res.data as Map<String, dynamic>;
});

final mgtBreakdownCompanyProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/breakdown', query: {'dimension': 'company', 'month': month});
  return (res.data['rows'] as List?) ?? [];
});

final mgtBreakdownBranchProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/breakdown', query: {'dimension': 'branch', 'month': month});
  return (res.data['rows'] as List?) ?? [];
});

class ManagementDashboardScreen extends ConsumerWidget {
  const ManagementDashboardScreen({super.key});

  void _refresh(WidgetRef ref) {
    ref.invalidate(mgtDashboardProvider);
    ref.invalidate(mgtTrailProvider);
    ref.invalidate(mgtAgentsProvider);
    ref.invalidate(mgtTrendProvider);
    ref.invalidate(mgtEmployeesProvider);
    ref.invalidate(mgtCustomersProvider);
    ref.invalidate(mgtBreakdownCompanyProvider);
    ref.invalidate(mgtBreakdownBranchProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final dash = ref.watch(mgtDashboardProvider);
    final trail = ref.watch(mgtTrailProvider);
    final employees = ref.watch(mgtEmployeesProvider);
    final customers = ref.watch(mgtCustomersProvider);
    final trend = ref.watch(mgtTrendProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Management'),
        actions: [
          IconButton(icon: const Icon(Icons.refresh), onPressed: () => _refresh(ref)),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => _refresh(ref),
        child: dash.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => ErrorState(message: 'Could not load dashboard.\n$e', onRetry: () => _refresh(ref)),
          data: (d) {
            final collection = d['collection'] as Map<String, dynamic>;
            final mtd = (collection['mtd_amount'] as num?) ?? 0;
            final target = collection['target_amount'] as num?;
            final collectionPct = target != null && target > 0 ? (mtd / target * 100).toStringAsFixed(1) : '—';
            final posTotal = collection['pos_total'] as num?;
            final outstanding = collection['outstanding_amount'] as num?;
            
            final activeAgentsCount = employees.maybeWhen(
              data: (list) => list.length.toString(),
              orElse: () => '-',
            );
            
            final activeCasesCount = customers.maybeWhen(
              data: (res) => res['total']?.toString() ?? '-',
              orElse: () => '-',
            );

            final ptpValue = trail.maybeWhen(
              data: (t) => t['ptps_pending_value'] as num?,
              orElse: () => null,
            );

            final ptpsBroken = trail.maybeWhen(
              data: (t) => t['ptps_broken'] as num?,
              orElse: () => null,
            );

            return ListView(
              padding: const EdgeInsets.all(AppSpacing.lg),
              children: [
                const DashboardSectionHeader('Agency Overview'),
                DashboardStatGrid(cards: [
                  DashboardStatCard(label: 'Total Collected MTD', value: '₹ ${_lakh(mtd)}', accent: AppColors.success),
                  DashboardStatCard(label: 'Collection %', value: '$collectionPct%'),
                  DashboardStatCard(label: 'PTP Value', value: '₹ ${_lakh(ptpValue)}'),
                  DashboardStatCard(label: 'Broken PTPs', value: '${ptpsBroken ?? 0}', accent: AppColors.error),
                  DashboardStatCard(label: 'Portfolio Assigned', value: '₹ ${_lakh(posTotal)}'),
                  DashboardStatCard(label: 'Outstanding', value: '₹ ${_lakh(outstanding)}'),
                  DashboardStatCard(label: 'Active Agents', value: activeAgentsCount),
                  DashboardStatCard(label: 'Active Cases', value: activeCasesCount),
                ]),
                
                const SizedBox(height: AppSpacing.lg),
                _buildSplitCards(collection),

                const DashboardSectionHeader('Recovery Trend · Last 7 Days'),
                trend.when(
                  loading: () => const Center(child: CircularProgressIndicator()),
                  error: (e, _) => const InlineErrorNote(message: 'Could not load trend — pull to retry'),
                  data: (list) => MiniBarChart(data: list),
                ),

                const SizedBox(height: AppSpacing.lg),
                const DashboardSectionHeader('Pending Integrations'),
                const DashboardGapCard(title: 'Revenue', reason: 'Not available in this app version — see web for details'),
                const DashboardGapCard(title: 'Agency Commission', reason: 'Not available in this app version — see web for details'),
                const DashboardGapCard(title: 'Compliance Alerts', reason: 'Not available in this app version — see web for details'),
                const DashboardGapCard(title: 'Legal Cases Status', reason: 'Not available in this app version — see web for details'),

                const DashboardSectionHeader('Client-wise Performance'),
                _buildBreakdownList(ref.watch(mgtBreakdownCompanyProvider), true),

                const DashboardSectionHeader('Branch-wise Performance'),
                _buildBreakdownList(ref.watch(mgtBreakdownBranchProvider), false),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _buildSplitCards(Map<String, dynamic> collection) {
    // Backend shape: by_type = {settlement, emi}, by_channel = {field,
    // telecalling, other} -- plain objects, not arrays of {type, amount}.
    final byType = collection['by_type'] as Map<String, dynamic>? ?? {};
    final byChannel = collection['by_channel'] as Map<String, dynamic>? ?? {};

    final settlement = (byType['settlement'] as num?) ?? 0;
    final emi = (byType['emi'] as num?) ?? 0;

    final field = (byChannel['field'] as num?) ?? 0;
    final telecalling = (byChannel['telecalling'] as num?) ?? 0;

    return Column(
      children: [
        _SplitCard(title: 'Settlement vs EMI', label1: 'Settlement', val1: settlement, label2: 'EMI', val2: emi),
        const SizedBox(height: AppSpacing.sm),
        _SplitCard(title: 'Field vs Telecalling', label1: 'Field', val1: field, label2: 'Telecalling', val2: telecalling),
      ],
    );
  }

  Widget _buildBreakdownList(AsyncValue<List<dynamic>> provider, bool isCompany) {
    return provider.when(
      loading: () => const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Center(child: CircularProgressIndicator()),
      ),
      error: (e, _) => const InlineErrorNote(message: 'Could not load this section — pull to retry'),
      data: (list) {
        if (list.isEmpty) return const Text('No data');
        return Column(
          children: list.map((item) {
            final name = item['label'] ?? 'Unknown';
            final collected = item['collected_amount'] as num? ?? 0;
            return Card(
              margin: const EdgeInsets.only(bottom: AppSpacing.sm),
              child: ListTile(
                title: Text(name.toString()),
                trailing: Text('₹ ${_lakh(collected)}', style: const TextStyle(fontWeight: FontWeight.bold).tabular),
              ),
            );
          }).toList(),
        );
      },
    );
  }
}

class _SplitCard extends StatelessWidget {
  final String title;
  final String label1;
  final num val1;
  final String label2;
  final num val2;

  const _SplitCard({
    required this.title,
    required this.label1,
    required this.val1,
    required this.label2,
    required this.val2,
  });

  @override
  Widget build(BuildContext context) {
    final total = val1 + val2;
    final pct1 = total > 0 ? val1 / total : 0.5;
    final pct2 = total > 0 ? val2 / total : 0.5;

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: AppSpacing.sm),
            Row(
              children: [
                Expanded(flex: (pct1 * 100).toInt(), child: Container(height: 8, color: AppColors.primary)),
                Expanded(flex: (pct2 * 100).toInt(), child: Container(height: 8, color: AppColors.neutralContainer)),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('$label1: ₹ ${_lakh(val1)}', style: const TextStyle(fontSize: 12)),
                Text('$label2: ₹ ${_lakh(val2)}', style: const TextStyle(fontSize: 12)),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class MiniBarChart extends StatelessWidget {
  final List<dynamic> data;
  const MiniBarChart({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    if (data.isEmpty) return const SizedBox.shrink();
    
    // Data is assumed to be ordered by date.
    final maxVal = data.fold<num>(0, (m, r) => (r['collected'] as num? ?? 0) > m ? (r['collected'] as num) : m);
    if (maxVal == 0) return const Center(child: Text('No collections in the last 7 days'));

    return SizedBox(
      height: 100,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: data.map((d) {
          final val = d['collected'] as num? ?? 0;
          final pct = val / maxVal;
          return Column(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              Text('₹ ${_lakh(val)}', style: const TextStyle(fontSize: 10)),
              const SizedBox(height: 4),
              Container(
                width: 24,
                height: 60 * pct,
                color: AppColors.primary,
              ),
              const SizedBox(height: 4),
              Text(
                (d['date'] as String?)?.substring(5, 10) ?? '', // MM-DD
                style: const TextStyle(fontSize: 10, color: Colors.grey),
              )
            ],
          );
        }).toList(),
      ),
    );
  }
}
