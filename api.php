<?php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, max-age=0');
date_default_timezone_set('Europe/Tallinn');
session_start();

$action = $_GET['action'] ?? '';

try {
    switch ($action) {
        case 'vehicles':
            respond(handleVehicles());
            break;
        case 'stops':
            respond(handleStops());
            break;
        case 'mapStops':
            respond(handleMapStops());
            break;
        case 'routes':
            respond(handleRoutes());
            break;
        case 'departures':
            respond(handleDepartures());
            break;
        case 'schools':
            respond(handleSchools());
            break;
        case 'authStatus':
            respond(handleAuthStatus());
            break;
        case 'login':
            respond(handleLogin());
            break;
        case 'register':
            respond(handleRegister());
            break;
        case 'logout':
            respond(handleLogout());
            break;
        case 'preferences':
            respond(handlePreferences());
            break;
        default:
            respond(['ok' => false, 'error' => 'Tundmatu API tegevus.'], 400);
    }
} catch (Throwable $exception) {
    respond(['ok' => false, 'error' => $exception->getMessage()], 500);
}

function respond(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fetchUrl(string $url, int $timeoutSeconds = 7): string
{
    if (function_exists('curl_init')) {
        $curl = curl_init($url);
        curl_setopt_array($curl, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => $timeoutSeconds,
            CURLOPT_TIMEOUT => $timeoutSeconds,
            CURLOPT_USERAGENT => 'BussRadar Tallinn/1.0',
        ]);
        $body = curl_exec($curl);
        $error = curl_error($curl);
        $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
        curl_close($curl);

        if ($body === false || $status >= 400) {
            throw new RuntimeException($error ?: 'Andmeallikas ei vastanud.');
        }

        return (string) $body;
    }

    $context = stream_context_create([
        'http' => [
            'timeout' => $timeoutSeconds,
            'header' => "User-Agent: BussRadar Tallinn/1.0\r\n",
        ],
        'ssl' => [
            'verify_peer' => true,
            'verify_peer_name' => true,
        ],
    ]);

    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        throw new RuntimeException('Andmeallikat ei saanud avada.');
    }

    return $body;
}

function handleAuthStatus(): array
{
    $username = currentUsername();
    if ($username === null) {
        return [
            'ok' => true,
            'authenticated' => false,
            'user' => null,
            'preferences' => defaultPreferences(),
        ];
    }

    return authPayload($username);
}

function handleLogin(): array
{
    $payload = requestPayload();
    $username = normalizeUsername((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');

    if ($username === '' || $password === '') {
        respond(['ok' => false, 'error' => 'Kasutajanimi ja parool on vajalikud.'], 400);
    }

    $store = readUserStore();
    $user = $store['users'][$username] ?? null;
    if (!is_array($user) || !password_verify($password, (string) ($user['passwordHash'] ?? ''))) {
        respond(['ok' => false, 'error' => 'Kasutajanimi või parool ei sobi.'], 401);
    }

    session_regenerate_id(true);
    $_SESSION['bussradar_user'] = $username;

    return authPayload($username);
}

function handleRegister(): array
{
    $payload = requestPayload();
    $username = normalizeUsername((string) ($payload['username'] ?? ''));
    $password = (string) ($payload['password'] ?? '');

    if ($username === '') {
        respond(['ok' => false, 'error' => 'Kasutajanimi võib sisaldada tähti, numbreid, punkti, alakriipsu ja sidekriipsu.'], 400);
    }

    if (mb_strlen($password) < 4) {
        respond(['ok' => false, 'error' => 'Parool peab olema vähemalt 4 märki.'], 400);
    }

    updateUserStore(static function (array &$store) use ($username, $password): void {
        if (isset($store['users'][$username])) {
            respond(['ok' => false, 'error' => 'Selline kasutaja on juba olemas.'], 409);
        }

        $now = date(DATE_ATOM);
        $store['users'][$username] = [
            'username' => $username,
            'passwordHash' => password_hash($password, PASSWORD_DEFAULT),
            'preferences' => defaultPreferences(),
            'createdAt' => $now,
            'updatedAt' => $now,
        ];
    });

    session_regenerate_id(true);
    $_SESSION['bussradar_user'] = $username;

    return authPayload($username);
}

function handleLogout(): array
{
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'], (bool) $params['secure'], (bool) $params['httponly']);
    }
    session_destroy();

    return [
        'ok' => true,
        'authenticated' => false,
        'user' => null,
        'preferences' => defaultPreferences(),
    ];
}

function handlePreferences(): array
{
    $username = requireUsername();

    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        return authPayload($username);
    }

    $preferences = normalizePreferences(requestPayload());
    updateUserStore(static function (array &$store) use ($username, $preferences): void {
        if (!isset($store['users'][$username])) {
            respond(['ok' => false, 'error' => 'Kasutajat ei leitud.'], 404);
        }

        $store['users'][$username]['preferences'] = $preferences;
        $store['users'][$username]['updatedAt'] = date(DATE_ATOM);
    });

    return authPayload($username);
}

function requestPayload(): array
{
    $raw = file_get_contents('php://input') ?: '';
    if ($raw !== '') {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            return $decoded;
        }
    }

    return $_POST;
}

function authPayload(string $username): array
{
    $store = readUserStore();
    $user = $store['users'][$username] ?? null;
    if (!is_array($user)) {
        unset($_SESSION['bussradar_user']);
        return [
            'ok' => true,
            'authenticated' => false,
            'user' => null,
            'preferences' => defaultPreferences(),
        ];
    }

    return [
        'ok' => true,
        'authenticated' => true,
        'user' => [
            'username' => (string) ($user['username'] ?? $username),
        ],
        'preferences' => normalizePreferences(is_array($user['preferences'] ?? null) ? $user['preferences'] : []),
    ];
}

function currentUsername(): ?string
{
    $username = $_SESSION['bussradar_user'] ?? null;
    if (!is_string($username) || $username === '') {
        return null;
    }

    return $username;
}

function requireUsername(): string
{
    $username = currentUsername();
    if ($username === null) {
        respond(['ok' => false, 'error' => 'Palun logi sisse.'], 401);
    }

    return $username;
}

function userStorePath(): string
{
    return __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'users.json';
}

function readUserStore(): array
{
    $path = userStorePath();
    if (!is_file($path)) {
        return ['users' => []];
    }

    $raw = file_get_contents($path);
    $raw = $raw === false ? false : removeBom($raw);
    $store = $raw === false ? null : json_decode($raw, true);
    if (!is_array($store)) {
        return ['users' => []];
    }

    $store['users'] = is_array($store['users'] ?? null) ? $store['users'] : [];
    return $store;
}

function updateUserStore(callable $callback): void
{
    $path = userStorePath();
    $directory = dirname($path);
    if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
        throw new RuntimeException('Kasutajate kausta ei saanud luua.');
    }

    $handle = fopen($path, 'c+');
    if ($handle === false) {
        throw new RuntimeException('Kasutajate faili ei saanud avada.');
    }

    try {
        if (!flock($handle, LOCK_EX)) {
            throw new RuntimeException('Kasutajate faili ei saanud lukustada.');
        }

        rewind($handle);
        $raw = stream_get_contents($handle);
        $raw = $raw === false ? false : removeBom($raw);
        $store = $raw === false || trim($raw) === '' ? ['users' => []] : json_decode($raw, true);
        if (!is_array($store)) {
            $store = ['users' => []];
        }
        $store['users'] = is_array($store['users'] ?? null) ? $store['users'] : [];

        $callback($store);

        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode($store, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($handle);
        flock($handle, LOCK_UN);
    } finally {
        fclose($handle);
    }
}

function defaultPreferences(): array
{
    return [
        'lines' => [],
        'stop' => null,
        'favoriteStops' => [],
        'lineColors' => [],
        'lineEmphasis' => [],
        'theme' => 'light',
    ];
}

function normalizePreferences(array $payload): array
{
    $preferences = defaultPreferences();
    $lineInput = $payload['lines'] ?? [];
    $preferences['lines'] = normalizeLineArray(is_array($lineInput) ? $lineInput : preg_split('/[\s,;]+/', (string) $lineInput));
    $preferences['stop'] = normalizePreferenceStop($payload['stop'] ?? null);
    $preferences['favoriteStops'] = normalizePreferenceStops($payload['favoriteStops'] ?? []);
    $preferences['lineColors'] = normalizeLineColors(is_array($payload['lineColors'] ?? null) ? $payload['lineColors'] : []);
    $preferences['lineEmphasis'] = normalizeLineEmphasisMap(is_array($payload['lineEmphasis'] ?? null) ? $payload['lineEmphasis'] : []);
    $preferences['theme'] = ($payload['theme'] ?? '') === 'dark' ? 'dark' : 'light';

    return $preferences;
}

function normalizeLineArray(?array $lines): array
{
    if ($lines === null) {
        return [];
    }

    return normalizeLineList(implode(',', array_map(static fn ($line): string => (string) $line, $lines)));
}

function normalizePreferenceStop(mixed $stop): ?array
{
    if (!is_array($stop)) {
        return null;
    }

    $id = cleanText((string) ($stop['id'] ?? ''));
    $lat = parseNullableNumber((string) ($stop['lat'] ?? ''));
    $lon = parseNullableNumber((string) ($stop['lon'] ?? ''));
    if ($id === '' || $lat === null || $lon === null || !isTallinnTransitCoordinate($lat, $lon)) {
        return null;
    }

    return [
        'id' => $id,
        'stopId' => cleanText((string) ($stop['stopId'] ?? '')),
        'siriId' => cleanText((string) ($stop['siriId'] ?? '')),
        'name' => cleanText((string) ($stop['name'] ?? 'Peatus ' . $id)),
        'street' => cleanText((string) ($stop['street'] ?? '')),
        'area' => cleanText((string) ($stop['area'] ?? '')),
        'city' => cleanText((string) ($stop['city'] ?? '')),
        'lat' => round($lat, 6),
        'lon' => round($lon, 6),
    ];
}

function normalizePreferenceStops(mixed $stops): array
{
    if (!is_array($stops)) {
        return [];
    }

    $normalized = [];
    $seen = [];
    foreach ($stops as $stop) {
        $item = normalizePreferenceStop($stop);
        if ($item === null) {
            continue;
        }

        $key = $item['stopId'] !== '' ? $item['stopId'] : $item['id'];
        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $normalized[] = $item;
    }

    return array_slice($normalized, 0, 24);
}

function normalizeLineColors(array $colors): array
{
    $normalized = [];
    foreach ($colors as $line => $color) {
        $line = normalizeLineArray([(string) $line])[0] ?? '';
        $color = (string) $color;
        if ($line !== '' && isHexColor($color)) {
            $normalized[$line] = strtolower($color);
        }
    }

    return $normalized;
}

function normalizeLineEmphasisMap(array $values): array
{
    $normalized = [];
    foreach ($values as $line => $value) {
        $line = normalizeLineArray([(string) $line])[0] ?? '';
        $value = (float) $value;
        if ($line !== '' && is_finite($value)) {
            $normalized[$line] = min(1, max(0, $value));
        }
    }

    return $normalized;
}

function normalizeUsername(string $username): string
{
    $username = strtolower(cleanText($username));
    return preg_match('/^[a-z0-9._-]{2,32}$/', $username) === 1 ? $username : '';
}

function handleVehicles(): array
{
    $lineFilter = normalizeLineList($_GET['lines'] ?? '');
    $wantedType = strtolower(trim((string) ($_GET['type'] ?? 'bus')));
    $raw = fetchUrl('https://transport.tallinn.ee/gps.txt', 6);
    $vehicles = parseGpsVehicles($raw);

    $vehicles = array_values(array_filter($vehicles, static function (array $vehicle) use ($lineFilter, $wantedType): bool {
        if ($wantedType !== '' && $wantedType !== 'all' && $vehicle['type'] !== $wantedType) {
            return false;
        }

        if ($lineFilter !== [] && !in_array(strtoupper($vehicle['line']), $lineFilter, true)) {
            return false;
        }

        return true;
    }));

    return [
        'ok' => true,
        'source' => 'https://transport.tallinn.ee/gps.txt',
        'updatedAt' => date(DATE_ATOM),
        'vehicles' => $vehicles,
    ];
}

function parseGpsVehicles(string $raw): array
{
    $vehicles = [];
    $lines = preg_split('/\r\n|\r|\n/', trim($raw)) ?: [];

    foreach ($lines as $lineText) {
        $lineText = trim($lineText);
        if ($lineText === '') {
            continue;
        }

        $parts = str_getcsv($lineText);
        if (count($parts) < 10) {
            continue;
        }

        $typeCode = cleanText((string) $parts[0]);
        $line = cleanText((string) $parts[1]);
        $lon = parseScaledCoordinate((string) $parts[2], 1000000);
        $lat = parseScaledCoordinate((string) $parts[3], 1000000);
        $speed = parseNullableNumber((string) $parts[4]);
        $bearing = normalizeBearing(parseNullableNumber((string) $parts[5]));
        $vehicleId = cleanText((string) $parts[6]);
        $status = cleanText((string) $parts[7]);
        $ageSeconds = parseNullableNumber((string) $parts[8]);
        $destination = cleanText(implode(',', array_slice($parts, 9)));

        if ($lat === null || $lon === null || $line === '' || $vehicleId === '') {
            continue;
        }

        if (!isTallinnTransitCoordinate($lat, $lon)) {
            continue;
        }

        $type = transportTypeFromCode($typeCode);

        $vehicles[] = [
            'id' => $vehicleId,
            'line' => strtoupper($line),
            'destination' => $destination,
            'type' => $type,
            'typeCode' => $typeCode,
            'lat' => $lat,
            'lon' => $lon,
            'speed' => normalizeSpeed($speed),
            'bearing' => $bearing,
            'status' => $status,
            'ageSeconds' => $ageSeconds,
        ];
    }

    return $vehicles;
}

function handleStops(): array
{
    $query = cleanText((string) ($_GET['q'] ?? ''));
    if (mb_strlen($query) < 2) {
        return ['ok' => true, 'stops' => []];
    }

    $raw = fetchUrl('https://transport.tallinn.ee/data/stops.txt', 7);
    $stops = parseTallinnStops($raw, $query, false);

    return [
        'ok' => true,
        'source' => 'https://transport.tallinn.ee/data/stops.txt',
        'stops' => array_slice($stops, 0, 18),
    ];
}

function handleMapStops(): array
{
    $raw = fetchUrl('https://transport.tallinn.ee/data/stops.txt', 7);
    $stops = array_values(array_filter(parseStructuredStops($raw), static function (array $stop): bool {
        return isTallinnMapCoordinate($stop['lat'], $stop['lon']);
    }));

    return [
        'ok' => true,
        'source' => 'https://transport.tallinn.ee/data/stops.txt',
        'updatedAt' => date(DATE_ATOM),
        'stops' => $stops,
    ];
}

function handleRoutes(): array
{
    $lineFilter = normalizeLineList($_GET['lines'] ?? '');
    if ($lineFilter === []) {
        return ['ok' => true, 'routes' => []];
    }

    $stopsRaw = fetchUrl('https://transport.tallinn.ee/data/stops.txt', 7);
    $routesRaw = fetchUrl('https://transport.tallinn.ee/data/routes.txt', 7);
    $stopsByPlatformId = [];

    foreach (parseStructuredStops($stopsRaw, true) as $stop) {
        $stopsByPlatformId[$stop['stopId']] = $stop;
    }

    $stopRoutes = parseRouteLines($routesRaw, $stopsByPlatformId, $lineFilter);
    $routes = mergeRoadShapesWithStops($lineFilter, $stopRoutes);

    return [
        'ok' => true,
        'source' => 'https://transport.tallinn.ee/data/tallinna-linn_bus_<line>.txt',
        'updatedAt' => date(DATE_ATOM),
        'routes' => $routes,
    ];
}

function parseTallinnStops(string $raw, string $query, bool $includeAggregates = false): array
{
    $queryNeedle = mb_strtolower($query);
    $results = [];

    foreach (parseStructuredStops($raw, $includeAggregates) as $stop) {
        if (!isTallinnMapCoordinate($stop['lat'], $stop['lon'])) {
            continue;
        }

        $haystack = mb_strtolower($stop['name'] . ' ' . $stop['street'] . ' ' . $stop['id'] . ' ' . $stop['stopId']);
        if (!str_contains($haystack, $queryNeedle)) {
            continue;
        }

        $results[] = $stop;
    }

    usort($results, static function (array $a, array $b) use ($queryNeedle): int {
        $aName = mb_strtolower($a['name']);
        $bName = mb_strtolower($b['name']);
        $aExact = $aName === $queryNeedle ? 0 : 1;
        $bExact = $bName === $queryNeedle ? 0 : 1;
        $aStarts = str_starts_with($aName, $queryNeedle) ? 0 : 1;
        $bStarts = str_starts_with($bName, $queryNeedle) ? 0 : 1;

        return $aExact <=> $bExact
            ?: $aStarts <=> $bStarts
            ?: strcmp($a['name'], $b['name'])
            ?: strcmp($a['stopId'], $b['stopId']);
    });

    return $results;
}

function parseStructuredStops(string $raw, bool $includeAggregates = false): array
{
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, $raw);
    rewind($handle);

    $stops = [];
    $byPlatformId = [];
    $seen = [];
    $isHeader = true;

    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        if ($isHeader) {
            $isHeader = false;
            continue;
        }

        $row = array_pad($row, 10, '');
        $platformId = cleanText(removeBom((string) $row[0]));
        $siriId = cleanText((string) $row[1]);
        $lat = parseScaledCoordinate((string) $row[2], 100000);
        $lon = parseScaledCoordinate((string) $row[3], 100000);
        $name = cleanText((string) $row[5]);
        $street = cleanText((string) $row[7]);
        $area = cleanText((string) $row[8]);
        $city = cleanText((string) $row[9]);

        if ($platformId === '' || $lat === null || $lon === null) {
            continue;
        }

        $isAggregate = str_starts_with($platformId, 'a');
        if ($isAggregate && !$includeAggregates) {
            continue;
        }

        $departureId = $siriId !== '' ? $siriId : $platformId;
        $key = $platformId . ':' . $departureId;
        if (isset($seen[$key])) {
            continue;
        }

        $seen[$key] = true;
        $stops[] = [
            'id' => $departureId,
            'stopId' => $platformId,
            'siriId' => $siriId,
            'name' => $name,
            'street' => $street === '0' ? '' : $street,
            'area' => $area,
            'city' => $city,
            'lat' => $lat,
            'lon' => $lon,
            'relatedStopIds' => array_values(array_filter(array_map('cleanText', explode(',', (string) $row[4])))),
        ];

        $byPlatformId[$platformId] = array_key_last($stops);
    }

    fclose($handle);

    foreach ($stops as $index => $stop) {
        if ($stop['name'] !== '') {
            continue;
        }

        foreach ($stop['relatedStopIds'] as $relatedStopId) {
            if (!isset($byPlatformId[$relatedStopId])) {
                continue;
            }

            $related = $stops[$byPlatformId[$relatedStopId]];
            if ($related['name'] === '') {
                continue;
            }

            $stops[$index]['name'] = $related['name'];
            if ($stops[$index]['street'] === '') {
                $stops[$index]['street'] = $related['street'];
            }
            break;
        }
    }

    foreach ($stops as $index => $stop) {
        if ($stop['name'] === '') {
            $stops[$index]['name'] = 'Peatus ' . $stop['stopId'];
        }

        unset($stops[$index]['relatedStopIds']);
    }

    return $stops;
}

function parseRouteLines(string $raw, array $stopsByPlatformId, array $lineFilter): array
{
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, $raw);
    rewind($handle);

    $routes = [];
    $isHeader = true;
    $currentLine = '';
    $currentTransport = '';

    while (($row = fgetcsv($handle, 0, ';')) !== false) {
        if ($isHeader) {
            $isHeader = false;
            continue;
        }

        $row = array_pad($row, 14, '');
        $line = cleanText(removeBom((string) $row[0]));
        $transport = strtolower(cleanText((string) $row[3]));

        if ($line !== '') {
            if (preg_match('/^[0-9A-Z]+$/', strtoupper($line)) !== 1) {
                continue;
            }

            $currentLine = strtoupper($line);
        }

        if ($transport !== '') {
            $currentTransport = $transport;
        }

        $routeStopsRaw = cleanText((string) $row[13]);
        if ($currentLine === '' || $routeStopsRaw === '' || !in_array($currentLine, $lineFilter, true)) {
            continue;
        }

        if ($currentTransport !== '' && $currentTransport !== 'bus') {
            continue;
        }

        $routeStopIds = array_values(array_filter(array_map('cleanText', explode(',', $routeStopsRaw))));
        $points = [];
        $stops = [];

        foreach ($routeStopIds as $routeStopId) {
            if (!isset($stopsByPlatformId[$routeStopId])) {
                continue;
            }

            $stop = $stopsByPlatformId[$routeStopId];
            $points[] = [$stop['lat'], $stop['lon']];
            $stops[] = [
                'id' => $stop['id'],
                'stopId' => $stop['stopId'],
                'name' => $stop['name'],
                'lat' => $stop['lat'],
                'lon' => $stop['lon'],
            ];
        }

        if (count($points) < 2) {
            continue;
        }

        $routes[] = [
            'line' => $currentLine,
            'tag' => cleanText((string) $row[8]),
            'name' => cleanText((string) $row[10]),
            'points' => $points,
            'stops' => $stops,
        ];
    }

    fclose($handle);

    return $routes;
}

function mergeRoadShapesWithStops(array $lineFilter, array $stopRoutes): array
{
    $shapeRoutes = parseGtfsShapeRoutes($lineFilter);
    $shapeLines = array_values(array_unique(array_map(static fn (array $route): string => $route['line'], $shapeRoutes)));
    $missingLines = array_values(array_diff($lineFilter, $shapeLines));

    if ($missingLines !== []) {
        $shapeRoutes = array_merge($shapeRoutes, parseOfficialLineShapeRoutes($missingLines));
    }

    return mergeShapeRoutesWithStops($shapeRoutes, $stopRoutes);
}

function mergeGtfsShapesWithStops(array $lineFilter, array $stopRoutes): array
{
    $shapeRoutes = parseGtfsShapeRoutes($lineFilter);
    if ($shapeRoutes === []) {
        return $stopRoutes;
    }

    return mergeShapeRoutesWithStops($shapeRoutes, $stopRoutes);
}

function mergeShapeRoutesWithStops(array $shapeRoutes, array $stopRoutes): array
{
    $stopRoutesByKey = [];
    foreach ($stopRoutes as $route) {
        $stopRoutesByKey[routeKey($route['line'], $route['tag'])] = $route;
    }

    $merged = [];
    $seen = [];

    foreach ($shapeRoutes as $route) {
        $key = routeKey($route['line'], $route['tag']);
        $fallback = $stopRoutesByKey[$key] ?? null;

        if ($fallback !== null) {
            $route['name'] = $fallback['name'] !== '' ? $fallback['name'] : $route['name'];
            $route['stops'] = $fallback['stops'];
        }

        $merged[] = $route;
        $seen[$key] = true;
    }

    foreach ($stopRoutes as $route) {
        $key = routeKey($route['line'], $route['tag']);
        if (!isset($seen[$key])) {
            $route['points'] = [];
            $route['shapeQuality'] = 'stops-only';
            $merged[] = $route;
        }
    }

    return $merged;
}

function parseOfficialLineShapeRoutes(array $lineFilter): array
{
    $routes = [];

    foreach ($lineFilter as $line) {
        $url = 'https://transport.tallinn.ee/data/tallinna-linn_bus_' . rawurlencode($line) . '.txt';

        try {
            $raw = fetchUrl($url, 8);
        } catch (Throwable) {
            continue;
        }

        foreach (parseOfficialLineShapeFile($line, $raw) as $route) {
            $routes[] = $route;
        }
    }

    usort($routes, static function (array $a, array $b): int {
        return strcmp($a['line'], $b['line']) ?: strcmp($a['tag'], $b['tag']);
    });

    return $routes;
}

function parseOfficialLineShapeFile(string $line, string $raw): array
{
    $routes = [];
    $tag = '';
    $encoded = '';
    $rows = preg_split('/\r\n|\r|\n/', trim($raw)) ?: [];

    $flush = static function () use (&$routes, &$encoded, &$tag, $line): void {
        if ($tag === '' || $encoded === '') {
            return;
        }

        $points = decodePolyline($encoded);
        if (count($points) < 2) {
            return;
        }

        $routes[] = [
            'line' => $line,
            'tag' => $tag,
            'name' => '',
            'points' => $points,
            'stops' => [],
            'shapeQuality' => 'road-shape',
            'shapeSource' => 'official-line',
        ];
    };

    foreach ($rows as $row) {
        $row = trim($row);
        if ($row === '') {
            continue;
        }

        if ($row === 'a-b' || $row === 'b-a') {
            $flush();
            $tag = $row;
            $encoded = '';
            continue;
        }

        if ($tag !== '' && preg_match('/^B+$/', $row) !== 1) {
            $encoded .= $row;
        }
    }

    $flush();

    return $routes;
}

function decodePolyline(string $encoded): array
{
    $points = [];
    $index = 0;
    $lat = 0;
    $lon = 0;
    $length = strlen($encoded);

    while ($index < $length) {
        $latDelta = decodePolylineValue($encoded, $index);
        $lonDelta = decodePolylineValue($encoded, $index);
        if ($latDelta === null || $lonDelta === null) {
            break;
        }

        $lat += $latDelta;
        $lon += $lonDelta;
        $pointLat = round($lat / 100000, 6);
        $pointLon = round($lon / 100000, 6);

        if (isTallinnMapCoordinate($pointLat, $pointLon)) {
            $points[] = [$pointLat, $pointLon];
        }
    }

    return $points;
}

function decodePolylineValue(string $encoded, int &$index): ?int
{
    $result = 0;
    $shift = 0;
    $length = strlen($encoded);

    do {
        if ($index >= $length) {
            return null;
        }

        $byte = ord($encoded[$index++]) - 63;
        $result |= ($byte & 0x1f) << $shift;
        $shift += 5;
    } while ($byte >= 0x20);

    return ($result & 1) !== 0 ? ~($result >> 1) : ($result >> 1);
}

function parseGtfsShapeRoutes(array $lineFilter): array
{
    $zip = fetchUrl('https://transport.tallinn.ee/data/gtfs.zip', 20);
    $routesTxt = readZipEntry($zip, 'routes.txt');
    $tripsTxt = readZipEntry($zip, 'trips.txt');
    $shapesTxt = readZipEntry($zip, 'shapes.txt');

    if ($routesTxt === null || $tripsTxt === null || $shapesTxt === null) {
        return [];
    }

    $selectedRouteIds = [];
    foreach (csvRows($routesTxt) as $row) {
        $line = strtoupper(cleanText($row['route_short_name'] ?? ''));
        $routeId = cleanText($row['route_id'] ?? '');
        $routeType = cleanText($row['route_type'] ?? '');

        if ($routeId === '' || $line === '' || $routeType !== '3' || !in_array($line, $lineFilter, true)) {
            continue;
        }

        $selectedRouteIds[$routeId] = [
            'line' => $line,
            'name' => cleanText($row['route_long_name'] ?? ''),
        ];
    }

    if ($selectedRouteIds === []) {
        return [];
    }

    $selectedShapes = [];
    foreach (csvRows($tripsTxt) as $row) {
        $routeId = cleanText($row['route_id'] ?? '');
        $shapeId = cleanText($row['shape_id'] ?? '');
        if ($routeId === '' || $shapeId === '' || !isset($selectedRouteIds[$routeId])) {
            continue;
        }

        $tag = shapeTag($shapeId);
        if ($tag === '') {
            $directionId = cleanText($row['direction_id'] ?? '');
            $tag = $directionId === '1' ? 'b-a' : ($directionId === '0' ? 'a-b' : '');
        }

        if (isset($selectedShapes[$shapeId])) {
            continue;
        }

        $selectedShapes[$shapeId] = [
            'line' => $selectedRouteIds[$routeId]['line'],
            'tag' => $tag,
            'name' => cleanText($row['trip_short_name'] ?? '') ?: $selectedRouteIds[$routeId]['name'],
            'points' => [],
            'stops' => [],
            'shapeQuality' => 'road-shape',
            'shapeSource' => 'gtfs',
        ];
    }

    if ($selectedShapes === []) {
        return [];
    }

    foreach (csvRows($shapesTxt) as $row) {
        $shapeId = cleanText($row['shape_id'] ?? '');
        if (!isset($selectedShapes[$shapeId])) {
            continue;
        }

        $lat = parseNullableNumber((string) ($row['shape_pt_lat'] ?? ''));
        $lon = parseNullableNumber((string) ($row['shape_pt_lon'] ?? ''));
        $sequence = (int) cleanText((string) ($row['shape_pt_sequence'] ?? '0'));
        if ($lat === null || $lon === null || !isTallinnMapCoordinate($lat, $lon)) {
            continue;
        }

        $selectedShapes[$shapeId]['points'][$sequence] = [$lat, $lon];
    }

    $routesByDirection = [];
    foreach ($selectedShapes as $shape) {
        ksort($shape['points']);
        $shape['points'] = array_values($shape['points']);
        $pointCount = count($shape['points']);

        if ($pointCount >= 2) {
            $key = routeKey($shape['line'], routeDirectionGroupTag($shape['tag']));
            $currentCount = isset($routesByDirection[$key]) ? count($routesByDirection[$key]['points']) : 0;

            if ($pointCount > $currentCount) {
                $routesByDirection[$key] = $shape;
            }
        }
    }

    $routes = array_values($routesByDirection);
    usort($routes, static function (array $a, array $b): int {
        return strcmp($a['line'], $b['line']) ?: strcmp($a['tag'], $b['tag']);
    });

    return $routes;
}

function csvRows(string $text): Generator
{
    $handle = fopen('php://temp', 'r+');
    fwrite($handle, $text);
    rewind($handle);

    $header = null;
    while (($row = fgetcsv($handle, 0, ',')) !== false) {
        if ($header === null) {
            $header = array_map(static fn (string $value): string => removeBom($value), $row);
            continue;
        }

        $row = array_pad($row, count($header), '');
        yield array_combine($header, array_slice($row, 0, count($header))) ?: [];
    }

    fclose($handle);
}

function readZipEntry(string $zip, string $entryName): ?string
{
    $eocd = strrpos($zip, "PK\x05\x06");
    if ($eocd === false || $eocd + 22 > strlen($zip)) {
        return null;
    }

    $centralDirectoryOffset = littleEndianUInt32(substr($zip, $eocd + 16, 4));
    $position = $centralDirectoryOffset;
    $length = strlen($zip);

    while ($position + 46 <= $length && substr($zip, $position, 4) === "PK\x01\x02") {
        $method = littleEndianUInt16(substr($zip, $position + 10, 2));
        $compressedSize = littleEndianUInt32(substr($zip, $position + 20, 4));
        $fileNameLength = littleEndianUInt16(substr($zip, $position + 28, 2));
        $extraLength = littleEndianUInt16(substr($zip, $position + 30, 2));
        $commentLength = littleEndianUInt16(substr($zip, $position + 32, 2));
        $localHeaderOffset = littleEndianUInt32(substr($zip, $position + 42, 4));
        $fileName = substr($zip, $position + 46, $fileNameLength);

        if ($fileName === $entryName) {
            $localFileNameLength = littleEndianUInt16(substr($zip, $localHeaderOffset + 26, 2));
            $localExtraLength = littleEndianUInt16(substr($zip, $localHeaderOffset + 28, 2));
            $dataOffset = $localHeaderOffset + 30 + $localFileNameLength + $localExtraLength;
            $compressed = substr($zip, $dataOffset, $compressedSize);

            if ($method === 0) {
                return $compressed;
            }

            if ($method === 8) {
                $inflated = @gzinflate($compressed);
                return $inflated === false ? null : $inflated;
            }

            return null;
        }

        $position += 46 + $fileNameLength + $extraLength + $commentLength;
    }

    return null;
}

function littleEndianUInt16(string $bytes): int
{
    $value = unpack('v', $bytes);
    return (int) ($value[1] ?? 0);
}

function littleEndianUInt32(string $bytes): int
{
    $value = unpack('V', $bytes);
    return (int) ($value[1] ?? 0);
}

function routeKey(string $line, string $tag): string
{
    return strtoupper($line) . ':' . $tag;
}

function shapeTag(string $shapeId): string
{
    if (preg_match('/_([ab]\d*-[ab]\d*)$/i', $shapeId, $matches) === 1) {
        return strtolower($matches[1]);
    }

    return '';
}

function routeDirectionGroupTag(string $tag): string
{
    $tag = strtolower($tag);
    if (preg_match('/^a\d*-b\d*$/', $tag) === 1) {
        return 'a-b';
    }

    if (preg_match('/^b\d*-a\d*$/', $tag) === 1) {
        return 'b-a';
    }

    return $tag;
}

function handleDepartures(): array
{
    $stopId = cleanText((string) ($_GET['stopid'] ?? ''));
    if ($stopId === '' || preg_match('/^[A-Za-z0-9-]+$/', $stopId) !== 1) {
        respond(['ok' => false, 'error' => 'Peatuse ID puudub.'], 400);
    }

    $url = 'https://transport.tallinn.ee/siri-stop-departures.php?stopid=' . rawurlencode($stopId);
    $raw = fetchUrl($url, 7);
    $parsed = parseDepartures($raw);

    return [
        'ok' => true,
        'source' => $url,
        'stopId' => $stopId,
        'serverSeconds' => $parsed['serverSeconds'],
        'updatedAt' => date(DATE_ATOM),
        'departures' => $parsed['departures'],
    ];
}

function parseDepartures(string $raw): array
{
    $text = str_replace(["\r\n", "\r", "\n"], ',', trim($raw));
    $parts = array_map('cleanText', str_getcsv($text));
    $modes = ['bus', 'tram', 'trolley', 'trolleybus', 'train'];
    $serverSeconds = null;

    foreach ($parts as $part) {
        if (ctype_digit($part) && (int) $part >= 0 && (int) $part < 90000) {
            $serverSeconds = (int) $part;
            break;
        }
    }

    $departures = [];
    for ($i = 0, $count = count($parts); $i + 6 < $count; $i++) {
        $mode = strtolower($parts[$i]);
        if (!in_array($mode, $modes, true)) {
            continue;
        }

        $expected = (int) $parts[$i + 2];
        $scheduled = (int) $parts[$i + 3];
        $delay = $expected - $scheduled;
        $minutes = $serverSeconds === null ? null : (int) ceil(max(0, $expected - $serverSeconds) / 60);

        $departures[] = [
            'type' => $mode,
            'line' => strtoupper($parts[$i + 1]),
            'expectedSeconds' => $expected,
            'scheduledSeconds' => $scheduled,
            'expectedTime' => secondsToClock($expected),
            'scheduledTime' => secondsToClock($scheduled),
            'minutesUntil' => $minutes,
            'delaySeconds' => $delay,
            'destination' => $parts[$i + 4],
            'vehicleId' => $parts[$i + 5],
            'status' => $parts[$i + 6],
        ];

        $i += 6;
    }

    return [
        'serverSeconds' => $serverSeconds,
        'departures' => $departures,
    ];
}

function handleSchools(): array
{
    $path = __DIR__ . DIRECTORY_SEPARATOR . 'data' . DIRECTORY_SEPARATOR . 'schools.json';
    $body = @file_get_contents($path);
    if ($body === false) {
        throw new RuntimeException('Koolide andmestik puudub.');
    }

    $schools = json_decode($body, true);
    if (!is_array($schools)) {
        throw new RuntimeException('Koolide andmestik on vigane.');
    }

    return [
        'ok' => true,
        'updatedAt' => date(DATE_ATOM),
        'schools' => $schools,
    ];
}

function normalizeLineList(string $input): array
{
    $items = preg_split('/[\s,;]+/', strtoupper(trim($input))) ?: [];
    $lines = [];
    foreach ($items as $item) {
        $item = trim($item);
        if ($item !== '' && preg_match('/^[0-9A-Z]+$/', $item) === 1) {
            $lines[] = $item;
        }
    }

    return array_values(array_unique($lines));
}

function parseScaledCoordinate(string $value, int $scale): ?float
{
    $value = trim($value);
    if ($value === '' || !is_numeric($value)) {
        return null;
    }

    return round(((float) $value) / $scale, 6);
}

function normalizeBearing(?float $bearing): ?float
{
    if ($bearing === null || $bearing < 0 || $bearing >= 360) {
        return null;
    }

    return round($bearing, 1);
}

function normalizeSpeed(?float $speed): ?float
{
    if ($speed === null || $speed < 0 || $speed > 140) {
        return null;
    }

    return round($speed, 1);
}

function parseNullableNumber(string $value): ?float
{
    $value = trim($value);
    if ($value === '' || !is_numeric($value)) {
        return null;
    }

    return (float) $value;
}

function secondsToClock(int $seconds): string
{
    $seconds %= 86400;
    if ($seconds < 0) {
        $seconds += 86400;
    }

    $hours = intdiv($seconds, 3600);
    $minutes = intdiv($seconds % 3600, 60);

    return sprintf('%02d:%02d', $hours, $minutes);
}

function cleanText(string $value): string
{
    return trim(preg_replace('/\s+/u', ' ', $value) ?? '');
}

function isHexColor(string $value): bool
{
    return preg_match('/^#[0-9a-f]{6}$/i', $value) === 1;
}

function removeBom(string $value): string
{
    return preg_replace('/^\xEF\xBB\xBF/', '', $value) ?? $value;
}

function isTallinnMapCoordinate(float $lat, float $lon): bool
{
    return $lat >= 59.30 && $lat <= 59.52 && $lon >= 24.52 && $lon <= 25.02;
}

function isTallinnTransitCoordinate(float $lat, float $lon): bool
{
    return $lat >= 59.25 && $lat <= 59.65 && $lon >= 24.35 && $lon <= 25.25;
}

function transportTypeFromCode(?string $code): string
{
    return match ($code) {
        '1' => 'trolleybus',
        '2' => 'bus',
        '3' => 'tram',
        default => 'bus',
    };
}

function isStopId(string $value): bool
{
    return ctype_digit($value) && strlen($value) >= 2 && strlen($value) <= 6;
}

function isScaledStopCoordinate(string $value): bool
{
    return ctype_digit($value) && strlen($value) >= 6 && strlen($value) <= 8;
}

function looksLikeStreet(string $value): bool
{
    return preg_match('/\b(tn|tee|mnt|puiestee|pst|maantee|tänav)\b/iu', $value) === 1;
}

function looksLikeRouteList(string $value): bool
{
    return preg_match('/^\d{5}-\d([,\s]+\d{5}-\d)*$/u', trim($value)) === 1;
}
