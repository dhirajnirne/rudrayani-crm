import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/api_client.dart';

class AuthState {
  final bool isLoggedIn;
  final Map<String, dynamic>? user;

  const AuthState({required this.isLoggedIn, this.user});
}

class AuthNotifier extends StateNotifier<AuthState> {
  final ApiClient _api;

  AuthNotifier(this._api) : super(const AuthState(isLoggedIn: false));

  Future<void> init() async {
    final has = await hasTokens();
    if (!has) return;
    try {
      final res = await _api.get<Map<String, dynamic>>('/employees/me');
      state = AuthState(isLoggedIn: true, user: res.data);
    } catch (_) {
      await clearTokens();
    }
  }

  Future<void> login(String phone, String password) async {
    final deviceId = await _getDeviceId();
    final res = await _api.post<Map<String, dynamic>>('/auth/login', data: {
      'phone': phone,
      'password': password,
      'device_id': deviceId,
    });
    final data = res.data!;
    await saveTokens(data['access_token'] as String, data['refresh_token'] as String);
    state = AuthState(isLoggedIn: true, user: data['user'] as Map<String, dynamic>?);
  }

  Future<void> logout() async {
    await clearTokens();
    state = const AuthState(isLoggedIn: false);
  }

  Future<String> _getDeviceId() async {
    final info = DeviceInfoPlugin();
    final android = await info.androidInfo;
    return android.id;
  }

  // Convenience: role checks against capability flags on the user object
  bool get isTeamLeader => state.user?['is_team_leader'] == true;
  bool get isTelecaller => state.user?['is_telecaller'] == true;
  bool get isFieldAgent => state.user?['is_field_agent'] == true;
}

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(apiClientProvider)),
);
