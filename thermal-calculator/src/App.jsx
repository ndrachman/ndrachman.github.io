import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Calculator.css';

// Physical constants and model parameters
const CONSTANTS = {
    // Boltzmann constant (J/K)
    k_B: 1.38e-23,
    // Electron charge (C)
    qe: 1.6e-19,
};

function IonSourceCalculator() {
    // State for input parameters as strings    <-- ADD HERE, REPLACE EXISTING STATE
    const [inputValues, setInputValues] = useState({
        r0: '20',       // tip radius (m)
        theta: '5',     // cone angle (degrees)
        rho: '0.1',     // resistivity (Ω·m)
        I: '1e-8',      // current (A)
        k: '0.75',      // thermal conductivity (W/(m·K))
        T_inf: '300'    // ambient temperature (K)
    });

    // State for parsed numerical parameters
    const [params, setParams] = useState({
        r0: 20,
        theta: 5,
        rho: 0.1,
        I: 1e-8,
        k: 0.75,
        T_inf: 300
    });

    // State for calculation results    <-- KEEP THIS EXISTING STATE
    const [temperatureData, setTemperatureData] = useState([]);
    const [tipTemperature, setTipTemperature] = useState(null);

    // Replace the existing handleInputChange function with this new one
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        // Update the string value
        setInputValues(prev => ({
            ...prev,
            [name]: value
        }));

        // Try to parse the value as a number
        try {
            // Handle both decimal and scientific notation
            const numValue = Function(`"use strict"; return (${value})`)();
            if (!isNaN(numValue) && isFinite(numValue)) {
                setParams(prev => ({
                    ...prev,
                    [name]: numValue
                }));
            }
        } catch (error) {
            // If parsing fails, don't update the numerical params
            console.log(`Invalid number format for ${name}: ${value}`);
        }
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
                const Tbc2 = params.T_inf + JouleTerm + EvapTerm + IonEvapTerm;

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
            console.log(`Total Term (x=0): ${params.T_inf + JouleTerm + EvapTerm + IonEvapTerm}`);

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
                temperature: params.T_inf + JouleTerm + EvapTerm + IonEvapTerm
            };
        });

        const filteredTemperatureData = temperatureData.filter(d => d.x >= 0 && d.x <= 5);

        setTemperatureData(temperatureProfile);
    }, [params]);
    
    const calculateYAxisTicks = (minValue, maxValue) => {
        console.log('Min value:', minValue);
        console.log('Max value:', maxValue);
        console.log('Range:', maxValue - minValue);
        
        const range = maxValue - minValue;
        const possibleIntervals = [100, 50, 25, 10, 5, 2.5, 1, 0.5, 0.25, 0.1, 0.05, 0.025, 0.01];
        
        // Find the interval that will give us 4-6 ticks
        let selectedInterval = possibleIntervals[0];
        for (const interval of possibleIntervals) {
            const numTicks = range / interval;
            console.log(`Interval ${interval} would give ${numTicks} ticks`);
            if (numTicks >= 3 && numTicks <= 8) {
                selectedInterval = interval;
                console.log('Selected interval:', selectedInterval);
                break;
            }
        }

        // Extend the range slightly to get nice round numbers
        const padding = selectedInterval;
        const lowBound = Math.floor(minValue / selectedInterval) * selectedInterval;
        const highBound = Math.ceil(maxValue / selectedInterval) * selectedInterval;

        // Generate ticks
        const ticks = [];
        for (let tick = lowBound; tick <= highBound + (selectedInterval / 2); tick += selectedInterval) {
            ticks.push(parseFloat(tick.toFixed(6))); // Avoid floating point errors
        }

        // If we got too many or too few ticks, try adjusting
        if (ticks.length < 4 || ticks.length > 7) {
            const smallerInterval = selectedInterval / 2;
            const moreTicks = [];
            for (let tick = lowBound; tick <= highBound + (smallerInterval / 2); tick += smallerInterval) {
                moreTicks.push(parseFloat(tick.toFixed(6)));
            }
            if (moreTicks.length >= 4 && moreTicks.length <= 6) {
                return moreTicks;
            }
        }
        
        return {
            ticks: ticks,
            domain: [ticks[0], ticks[ticks.length - 1]]
        };
    };

    return (
        <div className="calculator-container">
            <h1>Ion Source Tip Temperature Calculator</h1>
            
            <div className="calculator-content">
                <div className="input-grid">
                    <div className="input-container">
                        <label>Tip Radius (r₀) [nm]</label>
                        <input
                            type="text"
                            name="r0"
                            value={inputValues.r0}
                            onChange={handleInputChange}
                            placeholder="e.g., 100 or 1e2"
                        />
                    </div>
                    <div className="input-container">
                        <label>Cone Angle (θ) [degrees]</label>
                        <input
                            type="text"
                            name="theta"
                            value={inputValues.theta}
                            onChange={handleInputChange}
                            placeholder="e.g., 5"
                        />
                    </div>
                    <div className="input-container">
                        <label>Resistivity (ρ) [Ω·m]</label>
                        <input
                            type="text"
                            name="rho"
                            value={inputValues.rho}
                            onChange={handleInputChange}
                            placeholder="e.g., 0.1 or 1e-1"
                        />
                    </div>
                    <div className="input-container">
                        <label>Current (I) [A]</label>
                        <input
                            type="text"
                            name="I"
                            value={inputValues.I}
                            onChange={handleInputChange}
                            placeholder="e.g., 1e-8"
                        />
                    </div>
                    <div className="input-container">
                        <label>Thermal Conductivity (k) [W/(m·K)]</label>
                        <input
                            type="text"
                            name="k"
                            value={inputValues.k}
                            onChange={handleInputChange}
                            placeholder="e.g., 0.75"
                        />
                    </div>
                    <div className="input-container">
                        <label>Ambient Temperature (T∞) [K]</label>
                        <input
                            type="text"
                            name="T_inf"
                            value={inputValues.T_inf}
                            onChange={handleInputChange}
                            placeholder="e.g., 300"
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
                            <LineChart data={temperatureData.filter(d => d.x >= 0 && d.x <= 5)} margin={{ top: 20, right: 30, left: 25, bottom: 25 }}>
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
                                    ticks={calculateYAxisTicks(
                                        Math.min(...temperatureData.map(d => d.temperature)),
                                        Math.max(...temperatureData.map(d => d.temperature))
                                    ).ticks}
                                    domain={calculateYAxisTicks(
                                        Math.min(...temperatureData.map(d => d.temperature)),
                                        Math.max(...temperatureData.map(d => d.temperature))
                                    ).domain}
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

{/*                <div className="model-description">
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
                </div>*/}
            </div>
        </div>
    );
}

export default IonSourceCalculator;