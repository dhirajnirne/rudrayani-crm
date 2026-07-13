import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/theme/app_theme.dart';
import '../../core/widgets/state_views.dart';
import '../dashboard/dashboard_widgets.dart';
import 'management_dashboard_screen.dart'; // for MiniBarChart and _lakh

final mgtCompaniesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final res = await ref.read(apiClientProvider).get('/companies');
  return (res.data['companies'] as List?) ?? [];
});

final cvDashboardProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, companyId) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/dashboard', query: {'month': month, 'company_id': companyId});
  return res.data as Map<String, dynamic>;
});

final cvAgentsProvider = FutureProvider.autoDispose.family<List<dynamic>, String>((ref, companyId) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/agents', query: {'month': month, 'company_id': companyId});
  return (res.data['agents'] as List?) ?? [];
});

final cvTrendProvider = FutureProvider.autoDispose.family<List<dynamic>, String>((ref, companyId) async {
  final now = DateTime.now();
  final res = await ref.read(apiClientProvider).get('/reports/trend', query: {
    'granularity': 'day',
    'company_id': companyId,
    'from': DateFormat('yyyy-MM-dd').format(now.subtract(const Duration(days: 6))),
    'to': DateFormat('yyyy-MM-dd').format(now),
  });
  return (res.data['points'] as List?) ?? [];
});

final cvBreakdownProvider = FutureProvider.autoDispose.family<List<dynamic>, String>((ref, companyId) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref.read(apiClientProvider).get('/reports/breakdown', query: {'dimension': 'branch', 'company_id': companyId, 'month': month});
  return (res.data['rows'] as List?) ?? [];
});

String _lakh(num? v) {
  if (v == null) return '—';
  final l = v / 100000;
  if (l.abs() >= 0.01) return '${l.toStringAsFixed(2)}L';
  return NumberFormat.decimalPattern('en_IN').format(v);
}

class CompanyViewScreen extends ConsumerStatefulWidget {
  const CompanyViewScreen({super.key});

  @override
  ConsumerState<CompanyViewScreen> createState() => _CompanyViewScreenState();
}

class _CompanyViewScreenState extends ConsumerState<CompanyViewScreen> {
  String? _selectedCompanyId;

  @override
  Widget build(BuildContext context) {
    final companiesAsync = ref.watch(mgtCompaniesProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Company View'),
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(48),
          child: Container(
            height: 48,
            alignment: Alignment.centerLeft,
            child: companiesAsync.when(
              data: (companies) {
                if (companies.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(horizontal: AppSpacing.md),
                    child: Text('No companies available'),
                  );
                }
                
                // Select first company by default if none selected
                if (_selectedCompanyId == null && companies.isNotEmpty) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    if (mounted) setState(() => _selectedCompanyId = companies.first['id']);
                  });
                }

                return ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                  children: companies.map((c) => Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: FilterChip(
                      label: Text(c['name'] as String? ?? 'Unknown'),
                      selected: _selectedCompanyId == c['id'],
                      onSelected: (_) => setState(() => _selectedCompanyId = c['id'] as String),
                      selectedColor: AppColors.primarySurface,
                      checkmarkColor: AppColors.primaryDark,
                    ),
                  )).toList(),
                );
              },
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(horizontal: AppSpacing.md),
                child: Text('Loading companies...'),
              ),
              error: (_, __) => const SizedBox.shrink(),
            ),
          ),
        ),
      ),
      body: _selectedCompanyId == null
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: () async {
                ref.invalidate(cvDashboardProvider(_selectedCompanyId!));
                ref.invalidate(cvAgentsProvider(_selectedCompanyId!));
                ref.invalidate(cvTrendProvider(_selectedCompanyId!));
                ref.invalidate(cvBreakdownProvider(_selectedCompanyId!));
              },
              child: _buildCompanyData(context, _selectedCompanyId!),
            ),
    );
  }

  Widget _buildCompanyData(BuildContext context, String companyId) {
    final dash = ref.watch(cvDashboardProvider(companyId));
    final agents = ref.watch(cvAgentsProvider(companyId));
    final trend = ref.watch(cvTrendProvider(companyId));
    final breakdown = ref.watch(cvBreakdownProvider(companyId));

    return dash.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => ErrorState(message: 'Could not load company data.\n$e'),
      data: (d) {
        final collection = d['collection'] as Map<String, dynamic>;
        final mtd = (collection['mtd_amount'] as num?) ?? 0;
        final target = collection['target_amount'] as num?;
        final collectionPct = target != null && target > 0 ? (mtd / target * 100).toStringAsFixed(1) : '—';
        final posTotal = collection['pos_total'] as num?;
        final outstanding = collection['outstanding_amount'] as num?;
        final activeCases = collection['customer_count'] ?? '—';

        final agentsAssignedCount = agents.maybeWhen(
          data: (list) {
            int count = 0;
            for (final a in list) {
              if ((a['allocated_count'] as num? ?? 0) > 0) count++;
            }
            return count.toString();
          },
          orElse: () => '-',
        );

        return ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            DashboardStatGrid(cards: [
              DashboardStatCard(label: 'Total Collected MTD', value: '₹ ${_lakh(mtd)}', accent: AppColors.success),
              DashboardStatCard(label: 'Collection %', value: '$collectionPct%'),
              DashboardStatCard(label: 'Portfolio Assigned', value: '₹ ${_lakh(posTotal)}'),
              DashboardStatCard(label: 'Outstanding', value: '₹ ${_lakh(outstanding)}'),
              DashboardStatCard(label: 'Active Cases', value: '$activeCases'),
              DashboardStatCard(label: 'Agents Assigned', value: agentsAssignedCount),
            ]),
            
            const DashboardSectionHeader('Recovery Trend · Last 7 Days'),
            trend.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => const InlineErrorNote(message: 'Could not load trend — pull to retry'),
              data: (list) => MiniBarChart(data: list),
            ),

            const DashboardSectionHeader('Branch-wise Performance'),
            breakdown.when(
              loading: () => const Center(child: CircularProgressIndicator()),
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
            ),
          ],
        );
      },
    );
  }
}
