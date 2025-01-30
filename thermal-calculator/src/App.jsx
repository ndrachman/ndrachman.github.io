import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import './Calculator.css';

// Physical constants and model parameters
const CONSTANTS = {
    // Boltzmann constant (J/K)
    k_B: 1.38e-23,
    // Electron charge (C)
    qe: 1.6e-19,
    // Antoine parameters and physical properties
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
    ACETONITRILE: {
        A: 4.27873,
        B: 1355.374,
        C: -37.853,
        Hv: 7.05e-20,  // Enthalpy of vaporization (J)
        m_w: 4.1e-26,  // Molecular mass (kg)
    },
    Gdag: 0.8e-19,     // Ion evaporation activation energy (J)
    alpha: 1.5,        // Evaporation coefficient
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

    const [solvent, setSolvent] = useState('water');

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



    const handleSolventChange = (e) => {
        setSolvent(e.target.value);
    };

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
            // Generate temperature range for search (150K to 500K, log-spaced)
            const Tbc1 = Array.from(
                { length: 10000 }, 
                (_, i) => Math.pow(10, Math.log10(150) + (Math.log10(500) - Math.log10(150)) * i / 9999)
            );

            // Get solvent parameters
            const solventParams = 
                solvent === 'water' ? CONSTANTS.WATER : 
                solvent === 'formamide' ? CONSTANTS.FORMAMIDE : 
                solvent === 'acetonitrile' ? CONSTANTS.ACETONITRILE :
                CONSTANTS.WATER;  // default case if somehow none match

            const { A, B, C, Hv, m_w } = solventParams;
            const { Gdag, alpha, k_B, qe } = CONSTANTS;

            const x = 0;  // Calculate at the tip

            // Calculate temperature balance for each potential tip temperature
            const temperatures = Tbc1.map(Ttip => {
                // Evaporation rate term
                const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                (solvent === 'water' ? 
                    Math.pow(10, A - B / (Ttip + C)) :      // if water
                    solvent === 'formamide' ?
                    1e5 * Math.pow(10, A - B / (Ttip + C)) : // if formamide
                    1e5 * Math.pow(10, A - B / (Ttip + C)))      // if acetonitrile
                / Math.sqrt(2 * Math.PI * m_w * k_B * Ttip);
                // Joule heating term
                const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                    (1 / (r0_meters * (r0_meters + x * Math.tan(thetaRad))) - 
                     1 / (2 * (r0_meters + x * Math.tan(thetaRad))**2));

                // Evaporative cooling term
                const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * r0_meters);

                // Ion evaporation term
                const IonEvapTerm = -I * Gdag / 
                    (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + x * Math.tan(thetaRad)));

                // Calculate total temperature (T_inf + heating - cooling terms)
                const Tbc2 = params.T_inf + JouleTerm + EvapTerm + IonEvapTerm;

                // Return temperature difference for finding intersection
                return {
                    T1: Ttip,
                    T2: Tbc2,
                    diff: Ttip - Tbc2
                };
            });

            // Find intersection point where T1 = T2 (diff changes sign)
            const intersectionIndex = temperatures.findIndex((point, index) => 
                index > 0 && 
                Math.sign(temperatures[index-1].diff) !== Math.sign(point.diff)
            );

            // Get the tip temperature at intersection
            const Ttip = intersectionIndex !== -1 
                ? Tbc1[intersectionIndex] 
                : Tbc1[Tbc1.length - 1];

            // Recalculate final terms at found tip temperature for logging
            const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                (solvent === 'water' ? 
                    Math.pow(10, A - B / (Ttip + C)) :      // if water
                    solvent === 'formamide' ?
                    1e5 * Math.pow(10, A - B / (Ttip + C)) : // if formamide
                    1e5 * Math.pow(10, A - B / (Ttip + C)))      // if acetonitrile
                / Math.sqrt(2 * Math.PI * m_w * k_B * Ttip);

            const JouleTerm = I**2 * rho / (k * Math.PI**2 * Math.tan(thetaRad)**2) * 
                (1 / (r0_meters * (r0_meters + x * Math.tan(thetaRad))) - 
                 1 / (2 * (r0_meters + x * Math.tan(thetaRad))**2));

            const EvapTerm = -Qdot_evap / (k * Math.PI * Math.tan(thetaRad) * r0_meters);

            const IonEvapTerm = -I * Gdag / 
                (k * qe * Math.PI * Math.tan(thetaRad) * (r0_meters + x * Math.tan(thetaRad)));

            // Log the final terms for debugging
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
            (_, i) => Math.pow(10, -12 + ((-1 - (-12)) * i / 999))
        );

        const temperatureProfile = x.map(xi => {
            // Get solvent parameters again
            const solventParams = 
                solvent === 'water' ? CONSTANTS.WATER : 
                solvent === 'formamide' ? CONSTANTS.FORMAMIDE : 
                solvent === 'acetonitrile' ? CONSTANTS.ACETONITRILE :
                CONSTANTS.WATER;  // default case if somehow none match

            const { A, B, C, Hv, m_w } = solventParams;
            const { Gdag, alpha, k_B, qe } = CONSTANTS;

            // Calculate vapor pressure term based on solvent
            const vaporPressure = 
                solvent === 'water' ? Math.pow(10, A - B / (Ttip + C)) :      // if water
                solvent === 'formamide' ? 1e5 * Math.pow(10, A - B / (Ttip + C)) : // if formamide
                1e5 * Math.pow(10, A - B / (Ttip + C));     // if acetonitrile

            const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * vaporPressure / 
                Math.sqrt(2 * Math.PI * m_w * k_B * Ttip);

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

        setTemperatureData(temperatureProfile);
            }, [params, solvent]);  // <-- Modified line to include solvent

    
    const calculateYAxisTicks = (minValue, maxValue) => {
        // Include T_inf in the range
        const effectiveMin = Math.min(minValue, params.T_inf);
        const effectiveMax = Math.max(maxValue, params.T_inf);
        
        // Add padding (5% of the range on each side)
        const totalRange = effectiveMax - effectiveMin;
        const padding = totalRange * 0.1; // 10% padding
        
        const paddedMin = effectiveMin - padding;
        const paddedMax = effectiveMax + padding;
        
        console.log('Padded Min value:', paddedMin);
        console.log('Padded Max value:', paddedMax);
        console.log('Range:', paddedMax - paddedMin);
        
        const range = paddedMax - paddedMin;
        const possibleIntervals = [100, 50, 25, 10, 5, 2.5, 1, 0.5, 0.25, 0.1, 0.05, 0.025, 0.01, 0.005, 0.0025, 0.001, 0.0005, 0.00025, 0.0001];
        
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

        // Extend the range to get nice round numbers
        const lowBound = Math.floor(paddedMin / selectedInterval) * selectedInterval;
        const highBound = Math.ceil(paddedMax / selectedInterval) * selectedInterval;

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
                return {
                    ticks: moreTicks,
                    domain: [moreTicks[0], moreTicks[moreTicks.length - 1]]
                };
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
                {/* Left side - Controls */}
                <div className="controls-section">
                    <div className="input-grid">
                        <div className="input-container">
                            <label>Solvent</label>
                            <select
                                value={solvent}
                                onChange={handleSolventChange}
                                className="solvent-select"
                            >
                                <option value="water">Water</option>
                                <option value="formamide">Formamide</option>
                                <option value="acetonitrile">Acetonitrile</option>
                            </select>
                        </div>
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

                    <div className="model-description">
                        <h2>Model Description:</h2>
                        <p>
                            This calculator returns the temperature profile for an ion source in vacuum. 
                            The model considers the effects of solvent evaporative cooling and ion emission (Joule heating and ion evaporative cooling).
                            For a full description of the model, see Drachman & Stein 2025. 
                        </p>
                    </div>
                </div>

                {/* Right side - Visualization */}
                <div className="visualization-section">
                    {tipTemperature && (
                        <div className="result-container">
                            <p>Tip Temperature: {tipTemperature.toFixed(2)} K</p>
                        </div>
                    )}

                {temperatureData.length > 0 && (
                    <div className="chart-container">
                        <ResponsiveContainer>
                            <LineChart 
                                margin={{ top: 20, right: 30, left: 50, bottom: 25 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis
                                    dataKey="x"
                                    type="number"
                                    domain={[0, 5]}
                                    ticks={[0, 1, 2, 3, 4, 5]}
                                    tickFormatter={(value) => value.toFixed(0)}
                                    tickSize={-6}
                                    tick={{ fontSize: 12, dy: 10 }}
                                    label={{
                                        value: 'Normalized Position (x⋅tan(θ)/r₀)',
                                        position: 'insideBottom',
                                        offset: -15,
                                        fontsize: 24
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
                                    tickSize={-6}
                                    tick={{ fontSize: 12, dx: -9 }}
                                    label={{
                                        value: 'Temperature (K)',
                                        angle: -90,
                                        position: 'insideLeft',
                                        offset: -30,
                                        dy: 70,
                                        fontsize: 24
                                    }}
                                />
                                <Tooltip
                                    formatter={(value, name) => [
                                        value.toFixed(2) + ' K',
                                        name
                                    ]}
                                    labelFormatter={(label) => `x·tan(θ)/r₀: ${label.toFixed(2)}`}
                                />
                                <Line
                                    data={temperatureData.filter(d => d.x >= 0 && d.x <= 5)}
                                    type="monotone"
                                    dataKey="temperature"
                                    stroke="#8B1C24"
                                    strokeWidth={3}
                                    dot={false}
                                    name="Temperature"
                                />
                                <Line
                                    data={[
                                        { x: 0, ref_temperature: params.T_inf },
                                        { x: 5, ref_temperature: params.T_inf }
                                    ]}
                                    type="monotone"
                                    dataKey="ref_temperature"
                                    stroke="#4A4A4A"
                                    strokeWidth={2}
                                    strokeOpacity={0.5}
                                    dot={false}
                                    name="Ambient Temperature"
                                    // hide={true}  // Hide from tooltip
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                )}


{/*                <div className="model-description">
                    <h2>Model Description:</h2>
                    <p>
                        This calculator returns the temperature profile for an ion source in vacuum. 
                        The model considers the effects of solvent evaporative cooling and ion emission (Joule heating and ion evaporative cooling).
                        For a full description of the model, see Drachman & Stein 2025. 
                    </p>
                </div>*/}
                </div>
            </div>
        </div>
    );
}

export default IonSourceCalculator;