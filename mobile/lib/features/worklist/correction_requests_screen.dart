import 'package:flutter/material.dart';
import '../../../core/theme/app_theme.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../../core/api/api_client.dart';
import '../../core/widgets/state_views.dart';

final _date = DateFormat('dd MMM yyyy, HH:mm');

/// This agent's own submitted correction requests (GET /correction-requests
/// defaults to status=pending server-side unless overridden) — corrections
/// are always raised in context of a specific record (payment/PTP/call log,
/// via the existing correction_request_dialog.dart), so the standalone
/// More-menu screen is this tracking list, not a context-free "new" form.
final correctionRequestsProvider = FutureProvider.autoDispose.family<List<Map<String, dynamic>>, String>((ref, status) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/correction-requests', query: {'status': status});
  return (res.data!['requests'] as List).cast<Map<String, dynamic>>();
});

class CorrectionRequestsScreen extends ConsumerStatefulWidget {
  const CorrectionRequestsScreen({super.key});

  @override
  ConsumerState<CorrectionRequestsScreen> createState() => _CorrectionRequestsScreenState();
}

class _CorrectionRequestsScreenState extends ConsumerState<CorrectionRequestsScreen> {
  String _status = 'all';

  static const _filters = ['all', 'pending', 'approved', 'rejected'];

  Color _statusColor(String status) => switch (status) {
        'approved' => AppColors.success,
        'rejected' => AppColors.error,
        _ => AppColors.warning,
      };

  @override
  Widget build(BuildContext context) {
    final requests = ref.watch(correctionRequestsProvider(_status));

    return Scaffold(
      appBar: AppBar(
        title: const Text('Correction Requests'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(correctionRequestsProvider(_status)),
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
                  for (final f in _filters)
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: FilterChip(
                        label: Text(f[0].toUpperCase() + f.substring(1)),
                        selected: _status == f,
                        onSelected: (_) => setState(() => _status = f),
                      ),
                    ),
                ],
              ),
            ),
          ),
          Expanded(
            child: requests.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (e, _) => ErrorState(
                message: 'Could not load correction requests.',
                onRetry: () => ref.invalidate(correctionRequestsProvider(_status)),
              ),
              data: (list) {
                if (list.isEmpty) {
                  return const EmptyState(icon: Icons.edit_note, message: 'No correction requests');
                }
                return ListView.builder(
                  padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                  itemCount: list.length,
                  itemBuilder: (ctx, i) {
                    final r = list[i];
                    final status = r['status'] as String;
                    final createdAt = r['created_at'] != null
                        ? DateTime.parse(r['created_at'] as String).toLocal()
                        : null;
                    return Card(
                      margin: const EdgeInsets.only(bottom: 8),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
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
                                const SizedBox(width: 8),
                                Text(
                                  (r['record_type'] as String? ?? '').replaceAll('_', ' '),
                                  style: const TextStyle(fontSize: 12, color: AppColors.textSecondary),
                                ),
                              ],
                            ),
                            const SizedBox(height: 6),
                            Text(r['reason'] as String? ?? '', style: const TextStyle(fontSize: 13)),
                            if (createdAt != null) ...[
                              const SizedBox(height: 4),
                              Text(
                                _date.format(createdAt),
                                style: const TextStyle(fontSize: 11, color: AppColors.textTertiary).tabular,
                              ),
                            ],
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
