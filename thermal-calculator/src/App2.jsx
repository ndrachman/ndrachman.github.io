import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Calculator.css';

// Physical constants and model parameters
const CONSTANTS = {
    // Boltzmann constant (J/K)
    k_B: 1.38e-23,
    // Electron charge (C)
    qe: 1.6e-19,
    // Antoine parameters and physical properties for different solvents
    WATER: {
        A: 10.21,
        B: 1738.2,
        C: -38.95,
        Hv: 6.75e-20,  // Enthalpy of vaporization (J)
        m_w: 3e-26,    // Molecular mass (kg)
    },
    FORMAMIDE: {
        A: 7.585,
        B: 3881.3,
        C: 27.66,
        Hv: 8.42e-20,  // Enthalpy of vaporization (J)
        m_w: 7.5e-26,  // Molecular mass (kg)
    },
    Gdag: 0.8e-19,     // Ion evaporation activation energy (J)
    alpha: 1.5,        // Evaporation coefficient
};

function IonSourceCalculator() {
    // Add solvent selection state
    const [solvent, setSolvent] = useState('water');
    
    // State for input parameters
    const [params, setParams] = useState({
        r0: 20,         // tip radius (nm)
        theta: 5,       // cone angle (degrees)
        rho: 0.1,       // resistivity (Ω·m)
        I: 1e-8,        // current (A)
        k: 0.75,        // thermal conductivity (W/(m·K))
        T_inf: 300      // ambient temperature (K)
    });

    // State for calculation results
    const [temperatureData, setTemperatureData] = useState([]);
    const [tipTemperature, setTipTemperature] = useState(null);

    // Handle solvent change
    const handleSolventChange = (e) => {
        setSolvent(e.target.value);
    };

    // Handle input changes
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        try {
            const numValue = Function(`"use strict"; return (${value})`)();
            if (!isNaN(numValue) && isFinite(numValue)) {
                setParams(prev => ({
                    ...prev,
                    [name]: numValue
                }));
            }
        } catch (error) {
            console.log(`Invalid number format for ${name}: ${value}`);
        }
    };

    // Temperature calculation function
    const calculateTemperatureProfile = useCallback(() => {
        const r0_meters = params.r0 * 1e-9;
        const {theta, rho, I, k, T_inf } = params;
        const thetaRad = Math.PI * theta / 180;

        // Get solvent parameters
        const solventParams = solvent === 'water' ? CONSTANTS.WATER : CONSTANTS.FORMAMIDE;
        const { A, B, C, Hv, m_w } = solventParams;
        const { k_B, qe, Gdag, alpha } = CONSTANTS;

        // Calculate tip temperature
        const findTipTemperature = () => {
            const Tbc1 = Array.from(
                { length: 10000 }, 
                (_, i) => Math.pow(10, Math.log10(150) + (Math.log10(500) - Math.log10(150)) * i / 9999)
            );

            const x = 0;  // At tip

            const temperatures = Tbc1.map(T => {
                // Evaporation rate
                const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                    Math.pow(10, A - B / (T + C)) / 
                    Math.sqrt(2 * Math.PI * m_w * k_B * T);

                // Temperature terms
                const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                    (1 / (r0_meters * (r0_meters + x * Math.tan(thetaRad))) - 
                     1 / (2 * (r0_meters + x * Math.tan(thetaRad))**2));

                const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * r0_meters);

                const IonEvapTerm = -I * Gdag / 
                    (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + x * Math.tan(thetaRad)));

                const Tbc2 = T_inf + JouleTerm + EvapTerm + IonEvapTerm;

                return {
                    T1: T,
                    T2: Tbc2,
                    diff: T - Tbc2
                };
            });

            // Find intersection point
            const intersectionIndex = temperatures.findIndex((point, index) => 
                index > 0 && Math.sign(temperatures[index-1].diff) !== Math.sign(point.diff)
            );

            return intersectionIndex !== -1 ? Tbc1[intersectionIndex] : null;
        };

        // Calculate tip temperature
        const Ttip = findTipTemperature();
        if (Ttip) {
            setTipTemperature(Ttip);

            // Calculate temperature profile
            const x = Array.from(
                { length: 1000 }, 
                (_, i) => Math.pow(10, -12 + ((-3 - (-12)) * i / 999))
            );

            const temperatureProfile = x.map(xi => {
                const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                    Math.pow(10, A - B / (Ttip + C)) / 
                    Math.sqrt(2 * Math.PI * m_w * k_B * Ttip);

                const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                    (1 / (r0_meters * (r0_meters + xi * Math.tan(thetaRad))) - 
                     1 / (2 * (r0_meters + xi * Math.tan(thetaRad))**2));

                const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * (r0_meters + xi * Math.tan(thetaRad)));

                const IonEvapTerm = -I * Gdag / 
                    (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + xi * Math.tan(thetaRad)));

                return {
                    x: xi * Math.tan(thetaRad) / r0_meters,
                    temperature: T_inf + JouleTerm + EvapTerm + IonEvapTerm
                };
            });

            setTemperatureData(temperatureProfile);
        }
    }, [params, solvent]);

    return (
        <div className="calculator-container">
            <h1>Ion Source Tip Temperature Calculator</h1>
            
            <div className="calculator-content">
                <div className="input-grid">
                    {/* Solvent selection */}
                    <div className="input-container">
                        <label>Solvent</label>
                        <select
                            value={solvent}
                            onChange={handleSolventChange}
                            className="solvent-select"
                        >
                            <option value="water">Water</option>
                            <option value="formamide">Formamide</option>
                        </select>
                    </div>

                    <div className="input-container">
                        <label>Tip Radius (r₀) [nm]</label>
                        <input
                            type="text"
                            name="r0"
                            value={params.r0}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="input-container">
                        <label>Cone Angle (θ) [degrees]</label>
                        <input
                            type="text"
                            name="theta"
                            value={params.theta}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="input-container">
                        <label>Resistivity (ρ) [Ω·m]</label>
                        <input
                            type="text"
                            name="rho"
                            value={params.rho}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="input-container">
                        <label>Current (I) [A]</label>
                        <input
                            type="text"
                            name="I"
                            value={params.I}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="input-container">
                        <label>Thermal Conductivity (k) [W/(m·K)]</label>
                        <input
                            type="text"
                            name="k"
                            value={params.k}
                            onChange={handleInputChange}
                        />
                    </div>

                    <div className="input-container">
                        <label>Ambient Temperature (T∞) [K]</label>
                        <input
                            type="text"
                            name="T_inf"
                            value={params.T_inf}
                            onChange={handleInputChange}
                        />
                    </div>
                </div>

                <button 
                    className="calculate-button"
                    onClick={calculateTemperatureProfile}
                >
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
                            <LineChart 
                                data={temperatureData.filter(d => d.x >= 0 && d.x <= 5)}
                                margin={{ top: 20, right: 30, left: 25, bottom: 25 }}
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
                                    domain={['auto', 'auto']}
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
                                    labelFormatter={(label) => `x·tan(θ)/r₀: ${label.toFixed(2)}`}
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
            </div>
        </div>
    );
}

export default IonSourceCalculator;