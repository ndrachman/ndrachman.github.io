import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import './Calculator.css'  // Import the CSS

function App() {
  const [params, setParams] = useState({
    amplitude: 1.5,
    frequency: 1.2
  });
  
  const [data, setData] = useState([]);

  const handleCalculate = () => {
    const newData = [];
    for (let i = 0; i < 50; i++) {
      newData.push({
        x: i,
        y: params.amplitude * Math.sin(params.frequency * i)
      });
    }
    setData(newData);
  };

  return (
    <div className="calculator-container">
      <h1>Ion Source Temperature Calculator</h1>
      
      <div className="calculator-content">
        <div className="input-grid">
          <div className="input-container">
            <label>Amplitude</label>
            <input
              type="number"
              step="0.1"
              value={params.amplitude}
              onChange={(e) => setParams(prev => ({
                ...prev,
                amplitude: parseFloat(e.target.value)
              }))}
            />
          </div>
          <div className="input-container">
            <label>Frequency</label>
            <input
              type="number"
              step="0.1"
              value={params.frequency}
              onChange={(e) => setParams(prev => ({
                ...prev,
                frequency: parseFloat(e.target.value)
              }))}
            />
          </div>
        </div>

        <button className="calculate-button" onClick={handleCalculate}>
          Calculate
        </button>

        <div className="chart-container">
          <ResponsiveContainer>
            <LineChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" />
              <YAxis domain={[-2, 2]} />
              <Tooltip />
              <Line type="monotone" dataKey="y" stroke="#0066cc" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

export default App