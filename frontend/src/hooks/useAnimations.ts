import { useState, useEffect } from 'react';

/**
 * Hook to animate number transitions smoothly
 * @param value - Target value to animate to
 * @param duration - Animation duration in milliseconds (default: 300ms)
 * @returns Object with displayValue and isAnimating flag
 */
export const useAnimatedValue = (value: number, duration: number = 300) => {
    const [displayValue, setDisplayValue] = useState(value);
    const [isAnimating, setIsAnimating] = useState(false);

    useEffect(() => {
        if (value === displayValue) return;

        setIsAnimating(true);
        const startValue = displayValue;
        const difference = value - startValue;
        const startTime = Date.now();

        const animate = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Easing function (ease-out cubic)
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = startValue + (difference * eased);

            setDisplayValue(current);

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
            }
        };

        requestAnimationFrame(animate);
    }, [value, duration]);

    return { displayValue, isAnimating };
};

/**
 * Hook to trigger flash effect when value changes
 * @param value - Value to watch for changes
 * @param duration - Flash duration in milliseconds (default: 200ms)
 * @returns Boolean indicating if currently flashing
 */
export const useFlashOnChange = (value: any, duration: number = 200) => {
    const [isFlashing, setIsFlashing] = useState(false);

    useEffect(() => {
        setIsFlashing(true);
        const timer = setTimeout(() => setIsFlashing(false), duration);
        return () => clearTimeout(timer);
    }, [value, duration]);

    return isFlashing;
};
