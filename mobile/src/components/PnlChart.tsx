import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

interface PnlData {
    time: string;
    pnl: number;
}

interface PnlChartProps {
    data: PnlData[];
}

export const PnlChart: React.FC<PnlChartProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return (
            <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>No P&L data available yet</Text>
            </View>
        );
    }

    const screenWidth = Dimensions.get('window').width;

    // Transform data for Gifted Charts
    const chartData = data.map(d => ({
        value: d.pnl,
        label: d.time.split(':')[0] + ':' + d.time.split(':')[1], // HH:MM
        dataPointText: d.pnl.toFixed(0),
    }));

    const minVal = Math.min(...data.map(d => d.pnl));
    const maxVal = Math.max(...data.map(d => d.pnl));

    return (
        <View style={styles.container}>
            <Text style={styles.title}>CUMULATIVE P&L</Text>
            <View style={styles.chartWrapper}>
                <LineChart
                    data={chartData}
                    width={screenWidth - 60}
                    height={220}
                    spacing={40}
                    color1="#10b981"
                    textColor1="#10b981"
                    dataPointsColor1="#10b981"
                    startFillColor1="#10b981"
                    endFillColor1="#10b981"
                    startOpacity={0.3}
                    endOpacity={0.0}
                    initialSpacing={20}
                    noOfSections={4}
                    yAxisColor="#334155"
                    yAxisThickness={0}
                    rulesType="solid"
                    rulesColor="rgba(51, 65, 85, 0.3)"
                    yAxisTextStyle={{ color: '#94a3b8', fontSize: 10 }}
                    xAxisColor="#334155"
                    xAxisLabelTextStyle={{ color: '#94a3b8', fontSize: 10 }}
                    curved
                    isAnimated
                    animationDuration={1500}
                    pointerConfig={{
                        pointerStripHeight: 160,
                        pointerStripColor: 'lightgray',
                        pointerStripWidth: 2,
                        pointerColor: 'lightgray',
                        radius: 6,
                        pointerLabelWidth: 100,
                        pointerLabelHeight: 90,
                        activatePointersOnLongPress: true,
                        autoAdjustPointerLabelPosition: false,
                        pointerLabelComponent: (items: any) => {
                            return (
                                <View
                                    style={{
                                        height: 90,
                                        width: 100,
                                        justifyContent: 'center',
                                        marginTop: -30,
                                        marginLeft: -40,
                                    }}>
                                    <Text style={{ color: 'white', fontSize: 14, marginBottom: 6, textAlign: 'center' }}>
                                        {items[0].date}
                                    </Text>
                                    <View style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: 'white' }}>
                                        <Text style={{ fontWeight: 'bold', textAlign: 'center' }}>
                                            {'₹' + items[0].value + '.0'}
                                        </Text>
                                    </View>
                                </View>
                            );
                        },
                    }}
                />
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#1e293b', // Match card background from web
        borderRadius: 16,
        padding: 16,
        marginVertical: 10,
        borderWidth: 1,
        borderColor: '#334155',
    },
    title: {
        color: '#94a3b8',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 20,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    emptyContainer: {
        height: 200,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        borderRadius: 16,
        marginVertical: 10,
    },
    emptyText: {
        color: '#64748b',
        fontSize: 14,
    },
    chartWrapper: {
        overflow: 'hidden',
        marginLeft: -10
    }
});
