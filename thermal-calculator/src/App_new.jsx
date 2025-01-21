import React, { useState, useCallback } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Alert, AlertDescription } from '@/components/ui/alert';
import './Calculator.css';

// Physical constants and model parameters
const CONSTANTS = {
    // Boltzmann constant (J/K)
    k_B: 1.38e-23,
    // Electron charge (C)
    qe: 1.6e-19,
    // Antoine parameters for water
    WATER: {
        A: 10.21,
        B: 1738.2,
        C: -38.95,
        Hv: 6.75e-20,  // Enthalpy of vaporization (J)
        m_w: 3e-26,    // Molecular mass (kg)
    },
    // Antoine parameters for formamide
    FORMAMIDE: {
        A: 7.585,
        B: 3881.3,
        C: 27.66,
        Hv: 8.42e-20,  // Enthalpy of vaporization (J)
        m_w: 7.5e-26,  // Molecular mass (kg)
    },
    // Common parameters
    Gdag: 0.8e-19,     // Ion evaporation activation energy (J)
    alpha: 1.5,        // Evaporation coefficient
};

function IonSourceCalculator() {
    // Add solvent selection state
    const [solvent, setSolvent] = useState('water');
    
    // State for input parameters as strings
    const [inputValues, setInputValues] = useState({
        r0: '20',       // tip radius (nm)
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

    // Add error state
    const [errors, setErrors] = useState({});
    const [calculationError, setCalculationError] = useState(null);
    
    // State for calculation results
    const [temperatureData, setTemperatureData] = useState([]);
    const [tipTemperature, setTipTemperature] = useState(null);

    // Input validation function
    const validateInput = (name, value) => {
        const numValue = Number(value);
        
        switch(name) {
            case 'r0':
                if (numValue <= 0) return 'Tip radius must be positive';
                break;
            case 'theta':
                if (numValue <= 0 || numValue >= 90) return 'Cone angle must be between 0° and 90°';
                break;
            case 'rho':
                if (numValue <= 0) return 'Resistivity must be positive';
                break;
            case 'k':
                if (numValue <= 0) return 'Thermal conductivity must be positive';
                break;
            case 'T_inf':
                if (numValue < 0) return 'Temperature cannot be negative';
                break;
            case 'I':
                if (numValue === 0) return 'Current cannot be zero';
                break;
        }
        return null;
    };

    // Handle input changes with validation
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        
        // Update the string value
        setInputValues(prev => ({
            ...prev,
            [name]: value
        }));

        // Validate and update errors
        const error = validateInput(name, value);
        setErrors(prev => ({
            ...prev,
            [name]: error
        }));

        // Try to parse the value as a number
        try {
            const numValue = Function(`"use strict"; return (${value})`)();
            if (!isNaN(numValue) && isFinite(numValue)) {
                setParams(prev => ({
                    ...prev,
                    [name]: numValue
                }));
            }
        } catch (error) {
            setErrors(prev => ({
                ...prev,
                [name]: 'Invalid number format'
            }));
        }
    };

    // Handle solvent change
    const handleSolventChange = (e) => {
        setSolvent(e.target.value);
    };

    // Temperature calculation function
    const calculateTemperatureProfile = useCallback(() => {
        // Clear previous errors
        setCalculationError(null);

        // Check for any validation errors
        const hasErrors = Object.values(errors).some(error => error !== null);
        if (hasErrors) {
            setCalculationError('Please fix input errors before calculating');
            return;
        }

        const r0_meters = params.r0 * 1e-9;
        const {theta, rho, I, k } = params;
        const thetaRad = Math.PI * theta / 180;

        // Get solvent parameters
        const solventParams = solvent === 'water' ? CONSTANTS.WATER : CONSTANTS.FORMAMIDE;
        const { A, B, C, Hv, m_w } = solventParams;

        // Find tip temperature (self-consistent calculation)
        const findTipTemperature = () => {
            // Generate temperature range for search
            const Tbc1 = Array.from(
                { length: 10000 }, 
                (_, i) => Math.pow(10, Math.log10(150) + (Math.log10(500) - Math.log10(150)) * i / 9999)
            );

            // Constants for evaporation calculation
            const { Gdag, alpha } = CONSTANTS;
            const qe = CONSTANTS.qe;
            const k_B = CONSTANTS.k_B;
            const x = 0;

            // Calculate evaporation and terms
            const temperatures = Tbc1.map(T => {
                // Calculate vapor pressure based on solvent
                const Qdot_evap = alpha * Math.PI * r0_meters**2 * Hv * 
                    Math.pow(10, A - B / (T + C)) / 
                    Math.sqrt(2 * Math.PI * m_w * k_B * T);

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

            if (intersectionIndex === -1) {
                throw new Error('No solution found in the temperature range 150K-500K');
            }

            // Return tip temperature
            return Tbc1[intersectionIndex];
        };

        try {
            // Calculate tip temperature
            const Ttip = findTipTemperature();
            setTipTemperature(Ttip);

            // Calculate temperature profile along x
            const x = Array.from(
                { length: 1000 }, 
                (_, i) => Math.pow(10, -12 + ((-3 - (-12)) * i / 999))
            );

            const temperatureProfile = x.map(xi => {
                // Recalculate terms for profile using the same solvent parameters
                const { Gdag, alpha } = CONSTANTS;
                const qe = CONSTANTS.qe;
                const k_B = CONSTANTS.k_B;

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
                    temperature: params.T_inf + JouleTerm + EvapTerm + IonEvapTerm
                };
            });

            setTemperatureData(temperatureProfile);
        } catch (error) {
            setCalculationError(error.message);
            setTipTemperature(null);
            setTemperatureData([]);
        }
    }, [params, solvent, errors]);

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

                    {/* Other inputs */}
                    <div className="input-container">
                        <label>Tip Radius (r₀) [nm]</label>
                        <input
                            type="text"
                            name="r0"
                            value={inputValues.r0}
                            onChange={handleInputChange}
                            placeholder="e.g., 100 or 1e2"
                            className={errors.r0 ? 'error' : ''}
                        />
                        {errors.r0 && <span className="error-message">{errors.r0}</span>}
                    </div>
                    <div className="input-container">
                        <label>Cone Angle (θ) [degrees]</label>
                        <input
                            type="text"
                            name="theta"
                            value={inputValues.theta}
                            onChange={handleInputChange}
                            placeholder="e.g., 5"
                            className={errors.theta ? 'error' : ''}
                        />
                        {errors.theta && <span className="error-message">{errors.theta}</span>}
                    </div>
                    <div className="input-container">
                        <label>Resistivity (ρ) [Ω·m]</label>
                        <input
                            type="text"
                            name="rho"
                            value={inputValues.rho}
                            onChange={handleInputChange}
                            placeholder="e.g., 0.1 or 1e-1"
                            className={errors.rho ? 'error' : ''}
                        />
                        {errors.rho && <span className="error-message">{errors.rho}</span>}
                    </div>
                    <div className="input-container">
                        <label>Current (I) [A]</label>
                        <input
                            type="text"
                            name="I"
                            value={inputValues.I}
                            onChange={handleInputChange}
                            placeholder="e.g., 1e-8"
                            className={errors.I ? 'error' : ''}
                        />
                        {errors.I && <span className="error-message">{errors.I}</span>}
                    </div>
                    <div className="input-container">
                        <label>Thermal Conductivity (k) [W/(m·K)]</label>
                        <input
                            type="text"
                            name="k"
                            value={inputValues.k}
                            onChange={handleInputChange}
                            placeholder="e.g., 0.75"
                            className={errors.k ? 'error' : ''}
                        />
                        {errors.k && <span className="error-message">{errors.k}</span>}
                    </div>
                    <div className="input-container">
                        <label>Ambient Temperature (T∞) [K]</label>
                        <input
                            type="text"
                            name="T_inf"
                            value={inputValues.T_inf}
                            onChange={handleInputChange}
                            placeholder="e.g., 300"
                            className={errors.T_inf ? 'error' : ''}
                        />
                        {errors.T_inf && <span className="error-message">{errors.T_inf}</span>}
                    </div>
                </div>

                <button 
                    className="calculate-button" 
                    onClick={calculateTemperatureProfile}
                    disabled={Object.values(errors).some(error => error !== null)}
                >
                    Calculate Temperature Profile
                </button>

                {calculationError && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{calculationError}</AlertDescription>
                    </Alert>
                )}

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
            </div>
        </div>
    );
}

export default IonSourceCalculator;