<XAxis
    dataKey="x"
    type="number"
    domain={[0, 5]}
    tickFormatter={(value) => value.toFixed(2)}
    label={{ value: 'Normalized Position x·tan(θ)/r₀', position: 'insideBottom', offset: -10 }}
/>
import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Calculator.css';

// Physical constants and model parameters
const CONSTANTS = {
    // Boltzmann constant (J/K)
    k_B: 1.38e-23,
    // Electron charge (C)
    qe: 1.6e-19,
    // Ambient temperature (K)
    T_inf: 300
};

function IonSourceCalculator() {
    // State for input parameters
    const [params, setParams] = useState({
        r0: 20,       // tip radius (m)
        theta: 5,         // cone angle (degrees)
        rho: 0.1,         // resistivity (Ω·m)
        I: 10e-9,         // current (A)
        k: 0.75           // thermal conductivity (W/(m·K))
    });

    // State for calculation results
    const [temperatureData, setTemperatureData] = useState([]);
    const [tipTemperature, setTipTemperature] = useState(null);

    // Input change handler
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setParams(prev => ({
            ...prev,
            [name]: parseFloat(value)
        }));
    };

    // Temperature calculation function
    const calculateTemperatureProfile = useCallback(() => {
        const r0_meters = params.r0 * 1e-9;
        const {theta, rho, I, k } = params;
        const thetaRad = Math.PI * theta / 180;

        // Find tip temperature (self-consistent calculation)
        const findTipTemperature = () => {
            // Generate temperature range for search
            const Tbc1 = Array.from(
                { length: 10000 }, 
                (_, i) => Math.pow(10, Math.log10(150) + (Math.log10(500) - Math.log10(150)) * i / 9999)
            );

            // Constants for evaporation calculation
            const A = 10.21;
            const B = 1738.2;
            const C = -38.95;
            const Hv = 6.75e-20;
            const m_w = 3e-26;
            const qe = 1.6e-19;
            const Gdag = 0.8e-19;
            const alpha = 1.5;
            const x = 0;

            // Calculate evaporation and terms
            const temperatures = Tbc1.map(T => {
                // Evaporation rate term
                const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                    Math.pow(10, A - B / (T + C)) / 
                    Math.sqrt(2 * Math.PI * m_w * CONSTANTS.k_B * T);

                // Joule Term
                const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                    (1 / (r0_meters * (r0_meters + x * Math.tan(thetaRad))) - 
                     1 / (2 * (r0_meters + x * Math.tan(thetaRad))**2));

                // Evaporation Term
                const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * r0_meters);

                // Ion Evaporation Term
                const IonEvapTerm = -I * Gdag / 
                    (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + x * Math.tan(thetaRad)));

                // Total temperature
                const Tbc2 = CONSTANTS.T_inf + JouleTerm + EvapTerm + IonEvapTerm;

                return {
                    T1: T,
                    T2: Tbc2,
                    diff: T - Tbc2
                };
            });

            // Find intersection point
            const intersectionIndex = temperatures.findIndex((point, index) => 
                index > 0 && 
                Math.sign(temperatures[index-1].diff) !== Math.sign(point.diff)
            );

            // Return tip temperature
            const Ttip = intersectionIndex !== -1 
                ? Tbc1[intersectionIndex] 
                : Tbc1[Tbc1.length - 1];

            // Recalculate terms at found tip temperature for logging
            const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                Math.pow(10, A - B / (Ttip + C)) / 
                Math.sqrt(2 * Math.PI * m_w * CONSTANTS.k_B * Ttip);

            const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                (1 / (r0_meters * (r0_meters + x * Math.tan(thetaRad))) - 
                 1 / (2 * (r0_meters + x * Math.tan(thetaRad))**2));

            const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * r0_meters);

            const IonEvapTerm = -I * Gdag / 
                (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + x * Math.tan(thetaRad)));

            console.log(`Tip Temperature: ${Ttip.toFixed(5)} K`);
            console.log(`Qdot_evap (x=0): ${Qdot_evap.toExponential(4)}`);
            console.log(`JouleTerm (x=0): ${JouleTerm.toExponential(4)}`);
            console.log(`EvapTerm (x=0): ${EvapTerm.toExponential(4)}`);
            console.log(`IonEvapTerm (x=0): ${IonEvapTerm.toExponential(4)}`);
            console.log(`Total Term (x=0): ${CONSTANTS.T_inf + JouleTerm + EvapTerm + IonEvapTerm}`);

            return Ttip;
        };

        // Calculate tip temperature
        const Ttip = findTipTemperature();
        setTipTemperature(Ttip);

        // Calculate temperature profile along x
        const x = Array.from(
            { length: 1000 }, 
            (_, i) => Math.pow(10, -12 + ((-3 - (-12)) * i / 999))
        );

        const temperatureProfile = x.map(xi => {
            // Recalculate terms for profile
            const A = 10.21;
            const B = 1738.2;
            const C = -38.95;
            const Hv = 6.75e-20;
            const m_w = 3e-26;
            const qe = 1.6e-19;
            const Gdag = 0.8e-19;
            const alpha = 1.5;

            const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                Math.pow(10, A - B / (Ttip + C)) / 
                Math.sqrt(2 * Math.PI * m_w * CONSTANTS.k_B * Ttip);

            const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                (1 / (r0_meters * (r0_meters + xi * Math.tan(thetaRad))) - 
                 1 / (2 * (r0_meters + xi * Math.tan(thetaRad))**2));

            const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * (r0_meters + xi * Math.tan(thetaRad)));

            const IonEvapTerm = -I * Gdag / 
                (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + xi * Math.tan(thetaRad)));

            return {
                x: xi * Math.tan(thetaRad) / r0_meters,
                temperature: CONSTANTS.T_inf + JouleTerm + EvapTerm + IonEvapTerm
            };
        });

        const filteredTemperatureData = temperatureData.filter(d => d.x >= 0 && d.x <= 5);

        setTemperatureData(temperatureProfile);
    }, [params]);

    return (
        <div className="calculator-container">
            <h1>Ion Source Tip Temperature Calculator</h1>
            
            <div className="calculator-content">
                <div className="input-grid">
                    <div className="input-container">
                        <label>Tip Radius (r₀) [nm]</label>
                        <input
                            type="number"
                            name="r0"
                            value={params.r0}
                            onChange={handleInputChange}
                            step="1"
                        />
                    </div>
                    <div className="input-container">
                        <label>Cone Angle (θ) [degrees]</label>
                        <input
                            type="number"
                            name="theta"
                            value={params.theta}
                            onChange={handleInputChange}
                            step="1"
                        />
                    </div>
                    <div className="input-container">
                        <label>Resistivity (ρ) [Ω·m]</label>
                        <input
                            type="number"
                            name="rho"
                            value={params.rho}
                            onChange={handleInputChange}
                            step="0.1"
                        />
                    </div>
                    <div className="input-container">
                        <label>Current (I) [A]</label>
                        <input
                            type="number"
                            name="I"
                            value={params.I}
                            onChange={handleInputChange}
                            step="1e-9"
                        />
                    </div>
                    <div className="input-container">
                        <label>Thermal Conductivity (k) [W/(m·K)]</label>
                        <input
                            type="number"
                            name="k"
                            value={params.k}
                            onChange={handleInputChange}
                            step="0.1"
                        />
                    </div>
                </div>

                <button className="calculate-button" onClick={calculateTemperatureProfile}>
                    Calculate Temperature Profile
                </button>

                {tipTemperature && (
                    <div className="result-container">
                        <p>Tip Temperature: {tipTemperature.toFixed(2)} K</p>
                    </div>
                )}

                {temperatureData.length > 0 && (
                    <div className="chart-container">
                        <ResponsiveContainer>
                            <LineChart data={temperatureData.filter(d => d.x >= 0 && d.x <= 5)} margin={{ top: 20, right: 30, left: 25, bottom: 25 }}  // Add this line
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="x"
                                    type="number"
                                    domain={[0, 5]}
                                    tickFormatter={(value) => value.toFixed(2)}
                                    label={{
                                        value: 'Normalized Position x⋅tan(θ)/r₀',
                                        position: 'insideBottom',
                                        offset: -15
                                    }}
                                />
                                <YAxis
                                    domain={['dataMin - 5', 'dataMax + 5']}
                                    tickFormatter={(value) => value.toFixed(2)}
                                    label={{
                                        value: 'Temperature (K)',
                                        angle: -90,
                                        position: 'insideLeft',
                                        offset: -15
                                    }}
                                />
                                <Tooltip
                                    formatter={(value, name) => [
                                        value.toFixed(2),
                                        name === 'temperature' ? 'Temperature (K)' : 'Normalized Position'
                                    ]}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="temperature"
                                    stroke="#8884d8"
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}

                <div className="model-description">
                    <h3>Model Description</h3>
                    <p>
                        This calculator implements a thermal model for an ion source tip, 
                        considering Joule heating, evaporative cooling, and ion evaporation effects. 
                        The temperature profile is calculated using a self-consistent method 
                        that balances various thermal transfer mechanisms.
                    </p>
                    <p>Key components include:</p>
                    <ul>
                        <li>Joule heating from electrical current</li>
                        <li>Evaporative cooling based on molecular dynamics</li>
                        <li>Ion evaporation thermal effects</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}

export default IonSourceCalculator;