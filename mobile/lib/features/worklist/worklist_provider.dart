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

final dispositionCodesProvider = FutureProvider((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.get<Map<String, dynamic>>('/dispositions');
  final list = (res.data!['codes'] as List).cast<Map<String, dynamic>>();
  return list;
});
