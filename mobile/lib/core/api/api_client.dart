import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

// --dart-define=API_URL=... always wins over the build-mode default below,
// but is itself overridden at runtime by a saved server-URL override (see
// loadServerUrlOverride). 10.0.2.2 = Android emulator -> host loopback.
const _envUrl = String.fromEnvironment('API_URL', defaultValue: '');
const _debugDefaultUrl = 'http://10.0.2.2:4000';
const _releaseDefaultUrl =
    'https://rudrayani-backend-production.up.railway.app';

final _storage = FlutterSecureStorage(
  aOptions: const AndroidOptions(encryptedSharedPreferences: true),
);

// Keys used in secure storage
const _kAccessToken = 'access_token';
const _kRefreshToken = 'refresh_token';
const _kServerUrlOverride = 'server_url_override';

// Cached synchronously so a Dio instance can read it without an async gap —
// buildDio() itself must stay synchronous (it's also called from the field
// initializer of the background tracking isolate's task handler).
String? _cachedOverride;

String get effectiveBaseUrl {
  if (_cachedOverride != null && _cachedOverride!.isNotEmpty) {
    return _cachedOverride!;
  }
  if (_envUrl.isNotEmpty) return _envUrl;
  return kReleaseMode ? _releaseDefaultUrl : _debugDefaultUrl;
}

/// Must be awaited once per isolate before the first buildDio() call (see
/// main.dart and tracking_task.dart) — buildDio() itself stays synchronous.
Future<void> loadServerUrlOverride() async {
  _cachedOverride = await _storage.read(key: _kServerUrlOverride);
}

Future<void> setServerUrlOverride(String? url) async {
  if (url == null || url.isEmpty) {
    await _storage.delete(key: _kServerUrlOverride);
    _cachedOverride = null;
  } else {
    await _storage.write(key: _kServerUrlOverride, value: url);
    _cachedOverride = url;
  }
}

class ApiClient {
  final Dio _dio;

  ApiClient(this._dio);

  Future<Response<T>> get<T>(String path, {Map<String, dynamic>? query}) =>
      _dio.get<T>(path, queryParameters: query);

  Future<Response<T>> post<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
  }) => _dio.post<T>(path, data: data, queryParameters: query);

  Future<Response<T>> patch<T>(
    String path, {
    dynamic data,
    Map<String, dynamic>? query,
  }) => _dio.patch<T>(path, data: data, queryParameters: query);

  Future<Response<T>> postForm<T>(String path, FormData data) =>
      _dio.post<T>(path, data: data);
}

/// Also used by the background tracking isolate (tracking_task.dart), which
/// can't reach Riverpod providers — tokens come from secure storage either way.
Dio buildDio() {
  final dio = Dio(
    BaseOptions(
      baseUrl: '$effectiveBaseUrl/api',
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 30),
    ),
  );

  // Attach access token to every request
  dio.interceptors.add(
    InterceptorsWrapper(
      onRequest: (options, handler) async {
        final token = await _storage.read(key: _kAccessToken);
        if (token != null) options.headers['Authorization'] = 'Bearer $token';
        handler.next(options);
      },
      onError: (error, handler) async {
        // 401 → try refreshing once
        if (error.response?.statusCode == 401) {
          final refreshToken = await _storage.read(key: _kRefreshToken);
          if (refreshToken != null) {
            try {
              final refreshDio = Dio(
                BaseOptions(baseUrl: '$effectiveBaseUrl/api'),
              );
              final res = await refreshDio.post(
                '/auth/refresh',
                data: {'refresh_token': refreshToken},
              );
              final newAccess = res.data['access_token'] as String;
              final newRefresh = res.data['refresh_token'] as String?;
              await _storage.write(key: _kAccessToken, value: newAccess);
              if (newRefresh != null) {
                await _storage.write(key: _kRefreshToken, value: newRefresh);
              }
              // Retry original request
              final opts = error.requestOptions;
              opts.headers['Authorization'] = 'Bearer $newAccess';
              final retried = await dio.fetch(opts);
              return handler.resolve(retried);
            } catch (_) {
              await clearTokens();
            }
          }
        }
        handler.next(error);
      },
    ),
  );

  return dio;
}

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient(buildDio()));

Future<void> saveTokens(String access, String refresh) async {
  await Future.wait([
    _storage.write(key: _kAccessToken, value: access),
    _storage.write(key: _kRefreshToken, value: refresh),
  ]);
}

Future<void> clearTokens() async {
  await Future.wait([
    _storage.delete(key: _kAccessToken),
    _storage.delete(key: _kRefreshToken),
  ]);
}

Future<bool> hasTokens() async {
  final token = await _storage.read(key: _kAccessToken);
  return token != null;
}
