import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';
import '../../core/models/customer.dart';

final worklistProvider = FutureProvider<List<Customer>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/worklist');
  final data = res.data!;
  final list = (data['customers'] as List).cast<Map<String, dynamic>>();
  return list.map(Customer.fromJson).toList();
});

/// Resolves a single assigned customer by id — backs the detail screen and
/// its children (call log / payment / PTPs / field visit), which navigate
/// by id rather than carrying the Customer object across routes (go_router's
/// `extra` doesn't survive an app restart or a cold deep link).
final customerByIdProvider =
    FutureProvider.family<Customer, String>((ref, id) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/worklist/$id');
  return Customer.fromJson(res.data!['customer'] as Map<String, dynamic>);
});

final dispositionCodesProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/dispositions');
  // Backend responds with { disposition_codes: [...] } (backend/src/routes/dispositions.ts) --
  // this was reading the wrong key and throwing a cast error at runtime,
  // which silently broke the call-log disposition dropdown for every agent.
  final list = (res.data!['disposition_codes'] as List).cast<Map<String, dynamic>>();
  return list;
});
