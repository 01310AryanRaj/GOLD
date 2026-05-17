import os
import json
import yfinance as yf
import pandas as pd
import numpy as np

def run_predictions():
    try:
        import torch
        import pickle
        from train_model import DrawdownPredictor, SEQ_LENGTH, HIDDEN_SIZE, NUM_LAYERS
    except ImportError:
        print("⚠️ PyTorch not installed or train_model.py missing. Skipping AI predictions.")
        return

    base_dir = os.getcwd()
    assets = {
        "gold": "GC=F",
        "silver": "SI=F",
        "bitcoin": "BTC-USD"
    }
    
    predictions = {}
    
    for asset_name, ticker in assets.items():
        model_path = os.path.join(base_dir, 'models', f'{asset_name}_model.pth')
        scaler_x_path = os.path.join(base_dir, 'models', f'{asset_name}_scaler_x.pkl')
        scaler_y_path = os.path.join(base_dir, 'models', f'{asset_name}_scaler_y.pkl')
        
        if not (os.path.exists(model_path) and os.path.exists(scaler_x_path)):
            continue
            
        device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        print(f"\n🧠 Running AI prediction for {asset_name.upper()} on device: {device}...")
        
        model = DrawdownPredictor(5, HIDDEN_SIZE, NUM_LAYERS).to(device)
        model.load_state_dict(torch.load(model_path, map_location=device, weights_only=True))
        model.eval()
        
        with open(scaler_x_path, 'rb') as f:
            scaler_x = pickle.load(f)
        with open(scaler_y_path, 'rb') as f:
            scaler_y = pickle.load(f)
            
        df = yf.download(ticker, period="3mo", interval="1d", progress=False)
        if df.empty: continue
        if isinstance(df.columns, pd.MultiIndex):
            df.columns = df.columns.get_level_values(0)
        
        df = df[['Open', 'High', 'Low', 'Close', 'Volume']].dropna()
        if len(df) < SEQ_LENGTH:
            continue
            
        latest_data = df.tail(SEQ_LENGTH).values
        x_scaled = scaler_x.transform(latest_data)
        x_tensor = torch.tensor([x_scaled], dtype=torch.float32).to(device)
        
        with torch.no_grad():
            out_scaled = model(x_tensor).cpu().numpy()
            
        out_real = scaler_y.inverse_transform(out_scaled)[0]
        
        predictions[asset_name] = {
            "days_until": int(max(0, round(out_real[0]))),
            "expected_depth": float(max(0, round(out_real[1], 2)))
        }
        
    if predictions:
        out_path = os.path.join(base_dir, "static", "data", "predictions.json")
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, 'w') as f:
            json.dump(predictions, f)
        print(f"✅ Saved AI predictions to {out_path}")

def download_all_data():
    base_dir = os.getcwd()   # same folder as script execution

    assets = {
        "gold": "GC=F",
        "silver": "SI=F",
        "bitcoin": "BTC-USD"
    }

    # ✅ SAFE timeframes (no missing data issues)
    timeframes = {
        '1m': '7d',
        '2m': '60d',
        '5m': '60d',
        '15m': '60d',
        '30m': '60d',
        '1h': '60d',     # FIXED
        '1d': 'max',
        '1wk': 'max',
        '1mo': 'max'
    }

    for asset_name, ticker in assets.items():
        print(f"\nDownloading {asset_name.upper()}...")

        asset_dir = os.path.join(base_dir, "static", "data", asset_name)
        os.makedirs(asset_dir, exist_ok=True)

        for tf, period in timeframes.items():
            print(f"Fetching {tf}...")

            try:
                df = yf.download(
                    tickers=ticker,
                    period=period,
                    interval=tf,
                    auto_adjust=True,
                    progress=False
                )

                if df.empty:
                    print(f"⚠️ No data for {asset_name} {tf}")
                    continue

                if isinstance(df.columns, pd.MultiIndex):
                    df.columns = df.columns.get_level_values(0)

                file_path = os.path.join(asset_dir, f"{tf}.csv")
                df.to_csv(file_path)

                print(f"✅ Saved {file_path}")

            except Exception as e:
                print(f"❌ Error {asset_name} {tf}: {e}")

if __name__ == "__main__":
    download_all_data()
    print("\n🎉 All data downloaded!")
    run_predictions()