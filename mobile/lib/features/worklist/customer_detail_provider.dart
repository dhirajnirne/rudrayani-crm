import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/api_client.dart';

/// Full customer-360 payload (GET /customers/:id): trail, PTPs, payments,
/// field visits, attachments — everything the worklist-payload Customer
/// model doesn't carry. Used only for the History timeline; the existing
/// loan-detail/last-disposition/PTP cards keep reading the worklist payload
/// so they still render offline.
final customerDetailProvider =
    FutureProvider.family<Map<String, dynamic>, String>((
      ref,
      customerId,
    ) async {
      final api = ref.watch(apiClientProvider);
      final res = await api.get<Map<String, dynamic>>('/customers/$customerId');
      return res.data!;
    });
