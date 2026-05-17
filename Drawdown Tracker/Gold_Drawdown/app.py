import os
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import pandas as pd

app = Flask(__name__, static_folder='static')
CORS(app)

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


# Support relative asset paths at the root level locally under Flask
@app.route('/style.css')
def serve_style():
    return send_from_directory(app.static_folder, 'style.css')


@app.route('/script.js')
def serve_script():
    return send_from_directory(app.static_folder, 'script.js')


@app.route('/data/<path:path>')
def serve_data(path):
    return send_from_directory(os.path.join(app.static_folder, 'data'), path)


# ✅ DATE RANGE API
@app.route('/api/date_range', methods=['GET'])
def date_range():
    timeframe = request.args.get('timeframe', '1d')
    asset = request.args.get('asset', 'gold')

    file_path = os.path.join('data', asset, f'{timeframe}.csv')

    if not os.path.exists(file_path):
        return jsonify({"error": f"{asset} data for {timeframe} not found"}), 404

    df = pd.read_csv(file_path)

    date_col = 'Date' if 'Date' in df.columns else ('Datetime' if 'Datetime' in df.columns else 'index')

    df[date_col] = pd.to_datetime(df[date_col], utc=True, errors='coerce')
    df = df.dropna(subset=[date_col])

    return jsonify({
        "min_date": df[date_col].min().strftime('%Y-%m-%d'),
        "max_date": df[date_col].max().strftime('%Y-%m-%d')
    })


# ✅ ANALYZE API
@app.route('/api/analyze', methods=['GET'])
def analyze():
    timeframe    = request.args.get('timeframe', '1d')
    asset        = request.args.get('asset', 'gold')
    drawdown_pct = float(request.args.get('drawdown_pct', 5.0))
    start_date   = request.args.get('start_date', None)
    end_date     = request.args.get('end_date', None)

    file_path = os.path.join('data', asset, f'{timeframe}.csv')

    if not os.path.exists(file_path):
        return jsonify({"error": f"{asset} data for {timeframe} not found"}), 404

    df = pd.read_csv(file_path)

    if df.empty:
        return jsonify({"error": "No data available"}), 400

    date_col = 'Date' if 'Date' in df.columns else 'Datetime'
    if date_col not in df.columns and 'index' in df.columns:
        date_col = 'index'

    df[date_col] = pd.to_datetime(df[date_col], utc=True, errors='coerce')

    if start_date:
        df = df[df[date_col] >= pd.Timestamp(start_date, tz='UTC')]
    if end_date:
        df = df[df[date_col] <= pd.Timestamp(end_date, tz='UTC') + pd.Timedelta(days=1)]

    if df.empty:
        return jsonify({"error": "No data in selected period"}), 400

    recent_peak = -float('inf')
    events_count = 0
    in_drawdown_phase = False
    occurrences = []
    chart_data = []

    for _, row in df.iterrows():

        if pd.isna(row['Open']) or pd.isna(row['High']) or pd.isna(row['Low']) or pd.isna(row['Close']):
            continue

        d = pd.to_datetime(row[date_col])
        timestamp = int(d.timestamp())

        o, h, l, c = map(float, [row['Open'], row['High'], row['Low'], row['Close']])
        v = float(row['Volume']) if 'Volume' in row and not pd.isna(row['Volume']) else 0.0

        chart_data.append({
            "time": timestamp,
            "open": o,
            "high": h,
            "low": l,
            "close": c,
            "volume": v
        })

        if h > recent_peak:
            recent_peak = h
            in_drawdown_phase = False

        if not in_drawdown_phase and recent_peak > 0:
            if l <= recent_peak * (1 - drawdown_pct / 100.0):
                events_count += 1
                in_drawdown_phase = True
                occurrences.append({
                    "date": timestamp,
                    "peak": recent_peak,
                    "dip": l
                })

    return jsonify({
        "events_count": events_count,
        "occurrences": occurrences,
        "chart_data": chart_data
    })


if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    app.run(debug=True, port=5000)