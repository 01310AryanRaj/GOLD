import os
import pickle
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, TensorDataset
from sklearn.preprocessing import MinMaxScaler
import yfinance as yf

# Parameters
SEQ_LENGTH = 60
EPOCHS = 30
LR = 0.001
HIDDEN_SIZE = 64
NUM_LAYERS = 2

class DrawdownPredictor(nn.Module):
    def __init__(self, input_size, hidden_size, num_layers):
        super(DrawdownPredictor, self).__init__()
        self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True, dropout=0.2)
        self.fc = nn.Linear(hidden_size, 2) # [days_until, expected_depth]

    def forward(self, x):
        out, _ = self.lstm(x)
        out = self.fc(out[:, -1, :])
        return out

def compute_targets(df):
    future_window = 30
    targets = []
    
    close_prices = df['Close'].values
    high_prices = df['High'].values
    low_prices = df['Low'].values
    
    for i in range(len(df)):
        if i + future_window < len(df):
            future_lows = low_prices[i:i+future_window]
            
            current_close = close_prices[i]
            min_future_low = np.min(future_lows)
            
            dd_depth = ((current_close - min_future_low) / current_close) * 100
            dd_depth = max(0, dd_depth)
            
            days_until = np.argmin(future_lows)
            targets.append([days_until, dd_depth])
        else:
            targets.append([np.nan, np.nan])
            
    return np.array(targets)

def train_and_save_model(asset_name, ticker):
    print(f"Training PyTorch model for {asset_name.upper()}...")
    
    df = yf.download(tickers=ticker, period="max", interval="1d", progress=False)
    if df.empty:
        print(f"No data for {asset_name}")
        return
        
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)
        
    df = df[['Open', 'High', 'Low', 'Close', 'Volume']].dropna()
    
    targets = compute_targets(df)
    
    valid_idx = ~np.isnan(targets[:, 0])
    df_valid = df.iloc[valid_idx]
    targets_valid = targets[valid_idx]
    
    scaler_x = MinMaxScaler()
    x_scaled = scaler_x.fit_transform(df_valid.values)
    
    scaler_y = MinMaxScaler()
    y_scaled = scaler_y.fit_transform(targets_valid)
    
    X, Y = [], []
    for i in range(len(x_scaled) - SEQ_LENGTH):
        X.append(x_scaled[i:i+SEQ_LENGTH])
        Y.append(y_scaled[i+SEQ_LENGTH])
        
    X = np.array(X)
    Y = np.array(Y)
    
    if len(X) == 0:
        return
        
    split = int(0.8 * len(X))
    X_train, y_train = X[:split], Y[:split]
    
    train_dataset = TensorDataset(torch.tensor(X_train, dtype=torch.float32), torch.tensor(y_train, dtype=torch.float32))
    train_loader = DataLoader(train_dataset, batch_size=32, shuffle=True)
    
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"  Training on device: {device}")

    model = DrawdownPredictor(input_size=5, hidden_size=HIDDEN_SIZE, num_layers=NUM_LAYERS).to(device)
    criterion = nn.MSELoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    
    model.train()
    for epoch in range(EPOCHS):
        total_loss = 0
        for batch_x, batch_y in train_loader:
            batch_x, batch_y = batch_x.to(device), batch_y.to(device)
            optimizer.zero_grad()
            outputs = model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            total_loss += loss.item()
            
        if (epoch+1) % 10 == 0:
            print(f"  Epoch {epoch+1}/{EPOCHS}, Loss: {total_loss/len(train_loader):.4f}")
            
    os.makedirs('models', exist_ok=True)
    torch.save(model.state_dict(), f'models/{asset_name}_model.pth')
    
    with open(f'models/{asset_name}_scaler_x.pkl', 'wb') as f:
        pickle.dump(scaler_x, f)
    with open(f'models/{asset_name}_scaler_y.pkl', 'wb') as f:
        pickle.dump(scaler_y, f)
        
    print(f"✅ Saved model for {asset_name}\n")

if __name__ == "__main__":
    assets = {
        "gold": "GC=F",
        "silver": "SI=F",
        "bitcoin": "BTC-USD"
    }
    
    for name, ticker in assets.items():
        train_and_save_model(name, ticker)
        
    print("🎉 All PyTorch models trained and saved!")
