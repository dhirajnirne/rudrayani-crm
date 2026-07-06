import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';

/// "My Performance" (Phase 5): the same /reports/dashboard endpoint as the
/// web — the server clamps the scope to the signed-in user, so this shows
/// the agent's own book, collection vs target, and per-metric MTD.
final performanceProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final month = DateFormat('yyyy-MM').format(DateTime.now());
  final res = await ref
      .read(apiClientProvider)
      .get('/reports/dashboard', query: {'month': month});
  return res.data as Map<String, dynamic>;
});

String _lakh(num? v) {
  if (v == null) return '—';
  final l = v / 100000;
  if (l.abs() >= 0.01) return '${l.toStringAsFixed(2)}L';
  return NumberFormat.decimalPattern('en_IN').format(v);
}

String _pct(num? v) => v == null ? '—' : '${v.toStringAsFixed(1)}%';

const _metricTitles = {
  'resolution': 'Resolution',
  'rollback': 'Roll Back',
  'normalization': 'Normalization',
  'recovery': 'Recovery',
};

class PerformanceScreen extends ConsumerWidget {
  const PerformanceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final data = ref.watch(performanceProvider);

    return Scaffold(
      appBar: AppBar(
        backgroundColor: const Color(0xFF00535B),
        foregroundColor: Colors.white,
        title: Text('My Performance (${DateFormat('MMM yyyy').format(DateTime.now())})'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(performanceProvider),
          ),
        ],
      ),
      body: data.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('Could not load your performance.\n$e',
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.grey)),
          ),
        ),
        data: (d) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(performanceProvider),
          child: _PerformanceBody(data: d),
        ),
      ),
    );
  }
}

class _PerformanceBody extends StatelessWidget {
  final Map<String, dynamic> data;
  const _PerformanceBody({required this.data});

  @override
  Widget build(BuildContext context) {
    final days = data['days'] as Map<String, dynamic>;
    final collection = data['collection'] as Map<String, dynamic>;
    final allocated = data['allocated'] as Map<String, dynamic>;
    final metrics = data['metrics'] as Map<String, dynamic>;
    final trail = data['trail'] as Map<String, dynamic>;

    final mtd = (collection['mtd_amount'] as num?) ?? 0;
    final target = collection['target_amount'] as num?;
    final progress =
        target != null && target > 0 ? (mtd / target).clamp(0.0, 1.0) : null;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // Collection vs target — the headline card
        Card(
          color: const Color(0xFF00423F),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    const Text('Collection this month',
                        style: TextStyle(color: Colors.white70, fontSize: 13)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text('${days['left']} days left',
                          style: const TextStyle(color: Colors.white, fontSize: 11)),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  '₹ ${_lakh(mtd)}',
                  style: const TextStyle(
                      color: Color(0xFF35D431), fontSize: 32, fontWeight: FontWeight.bold),
                ),
                Text(
                  target != null
                      ? 'of ₹ ${_lakh(target)} target'
                      : 'No target set for this month',
                  style: const TextStyle(color: Colors.white70, fontSize: 13),
                ),
                if (progress != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: progress,
                      minHeight: 10,
                      backgroundColor: Colors.white.withValues(alpha: 0.15),
                      valueColor: const AlwaysStoppedAnimation(Color(0xFF35D431)),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    mtd >= target!
                        ? 'Target achieved! 🎉'
                        : '₹ ${_lakh(target - mtd)} to go'
                          ' · need ₹ ${_lakh(collection['run_rate_required'] as num?)} per day',
                    style: const TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),

        // My book + trail coverage
        Row(
          children: [
            Expanded(
              child: _StatCard(
                label: 'My accounts',
                value: '${allocated['count']}',
                sub: '₹ ${_lakh(allocated['amount'] as num?)} POS',
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _StatCard(
                label: 'Worked (trail)',
                value: '${trail['uploaded_count']} / ${trail['allocated_count']}',
                sub: _pct(trail['pct'] as num?),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        const Padding(
          padding: EdgeInsets.symmetric(vertical: 4),
          child: Text('Metrics',
              style: TextStyle(
                  fontWeight: FontWeight.bold, fontSize: 14, color: Color(0xFF00535B))),
        ),
        for (final entry in _metricTitles.entries)
          _MetricRow(
            title: entry.value,
            metric: metrics[entry.key] as Map<String, dynamic>,
          ),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final String sub;
  const _StatCard({required this.label, required this.value, required this.sub});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(label, style: const TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 4),
            Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            Text(sub, style: const TextStyle(fontSize: 12, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

class _MetricRow extends StatelessWidget {
  final String title;
  final Map<String, dynamic> metric;
  const _MetricRow({required this.title, required this.metric});

  @override
  Widget build(BuildContext context) {
    final mtd = metric['mtd_amount'] as num?;
    final target = metric['target_amount'] as num?;
    final pctVal = metric['mtd_pct'] as num?;
    final progress = target != null && target > 0
        ? ((mtd ?? 0) / target).clamp(0.0, 1.0)
        : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(title, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                Text(_pct(pctVal),
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF00535B))),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              target != null
                  ? '₹ ${_lakh(mtd)} of ₹ ${_lakh(target)} target'
                  : '₹ ${_lakh(mtd)} MTD · no target set',
              style: const TextStyle(fontSize: 12, color: Colors.grey),
            ),
            if (progress != null) ...[
              const SizedBox(height: 6),
              ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 6,
                  backgroundColor: const Color(0xFFE8ECEA),
                  valueColor: const AlwaysStoppedAnimation(Color(0xFF00535B)),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
