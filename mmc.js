define(['./utils'], function (utils) {
    "use strict";

        const CMD_REG = 0x0,
            LATCH_REG = 0x1,
            READ_DATA_REG = 0x2,
            WRITE_DATA_REG = 0x3,
            STATUS_REG = 0x4,

            CMD_DIR_OPEN = 0x0,
            CMD_DIR_READ = 0x1,
            CMD_DIR_CWD = 0x2,

             CMD_FILE_CLOSE		= 0x10,
     CMD_FILE_OPEN_READ	= 0x11,
     CMD_FILE_OPEN_IMG	= 0x12,
     CMD_FILE_OPEN_WRITE	= 0x13,
     CMD_FILE_DELETE		= 0x14,
     CMD_FILE_GETINFO	= 0x15,
     CMD_FILE_SEEK		= 0x16,
     CMD_FILE_OPEN_RAF      = 0x17,

     CMD_INIT_READ		= 0x20,
     CMD_INIT_WRITE		= 0x21,
     CMD_READ_BYTES		= 0x22,
     CMD_WRITE_BYTES		= 0x23,
            // READ_DATA_REG "commands"

            // EXEC_PACKET_REG "commands"
             CMD_EXEC_PACKET		= 0x3F,

    // SDOS_LBA_REG commands
     CMD_LOAD_PARAM		= 0x40,
     CMD_GET_IMG_STATUS	= 0x41,
     CMD_GET_IMG_NAME	= 0x42,
     CMD_READ_IMG_SEC	= 0x43,
     CMD_WRITE_IMG_SEC	= 0x44,
     CMD_SER_IMG_INFO	= 0x45,
     CMD_VALID_IMG_NAMES	= 0x46,
     CMD_IMG_UNMOUNT		= 0x47,

    // UTIL_CMD_REG commands
     CMD_GET_CARD_TYPE	= 0x80,
     CMD_GET_PORT_DDR	= 0xA0,
     CMD_SET_PORT_DDR	= 0xA1,
     CMD_READ_PORT		= 0xA2,
     CMD_WRITE_PORT		= 0xA3,
     CMD_GET_FW_VER		= 0xE0,
     CMD_GET_BL_VER		= 0xE1,
     CMD_GET_CFG_BYTE	= 0xF0,
     CMD_SET_CFG_BYTE	= 0xF1,
     CMD_READ_AUX		= 0xFD,
     CMD_GET_HEARTBEAT	= 0xFE,


    // Status codes
     STATUS_OK		= 0x3F,
     STATUS_COMPLETE		= 0x40,
     STATUS_EOF		= 0x60,
    	STATUS_BUSY		= 0x80,

     ERROR_MASK		= 0x3F,

    // To be or'd with STATUS_COMPLETE
     ERROR_NO_DATA		= 0x08,
     ERROR_INVALID_DRIVE	= 0x09,
     ERROR_READ_ONLY		= 0x0A,
     ERROR_ALREADY_MOUNT	= 0x0A,
     ERROR_TOO_MANY_OPEN	= 0x12,

    // Offset returned file numbers by = 0x20, to disambiguate from errors
     FILENUM_OFFSET		= 0x20,

    // STATUS_REG bit masks
    //
    // MMC_MCU_BUSY set by a write to CMD_REG by the Atom, cleared by a write by the MCU
    // MMC_MCU_READ set by a write by the Atom (to any reg), cleared by a read by the MCU
    // MCU_MMC_WROTE set by a write by the MCU cleared by a read by the Atom (any reg except status).
    //
     MMC_MCU_BUSY		= 0x01,
     MMC_MCU_READ		= 0x02,
     MMC_MCU_WROTE		= 0x04;


        /*
          atmmmc2def.h Symbolic defines for AtoMMC2

        2011-05-25, Phill Harvey-Smith.


    // Register definitions, these are offsets from 0xB400 on the Atom side.

        #define CMD_REG			0x00
        #define LATCH_REG		0x01
        #define READ_DATA_REG		0x02
        #define WRITE_DATA_REG		0x03
        #define STATUS_REG		0x04

    // DIR_CMD_REG commands
        #define CMD_DIR_OPEN		0x00
        #define CMD_DIR_READ		0x01
        #define CMD_DIR_CWD		0x02

    // CMD_REG_COMMANDS
        #define CMD_FILE_CLOSE		0x10
        #define CMD_FILE_OPEN_READ	0x11
        #define CMD_FILE_OPEN_IMG	0x12
        #define CMD_FILE_OPEN_WRITE	0x13
        #define CMD_FILE_DELETE		0x14
        #define CMD_FILE_GETINFO	0x15
        #define CMD_FILE_SEEK		0x16
        #define CMD_FILE_OPEN_RAF       0x17

        #define CMD_INIT_READ		0x20
        #define CMD_INIT_WRITE		0x21
        #define CMD_READ_BYTES		0x22
        #define CMD_WRITE_BYTES		0x23

    // READ_DATA_REG "commands"

    // EXEC_PACKET_REG "commands"
        #define CMD_EXEC_PACKET		0x3F

    // SDOS_LBA_REG commands
        #define CMD_LOAD_PARAM		0x40
        #define CMD_GET_IMG_STATUS	0x41
        #define CMD_GET_IMG_NAME	0x42
        #define CMD_READ_IMG_SEC	0x43
        #define CMD_WRITE_IMG_SEC	0x44
        #define CMD_SER_IMG_INFO	0x45
        #define CMD_VALID_IMG_NAMES	0x46
        #define CMD_IMG_UNMOUNT		0x47

    // UTIL_CMD_REG commands
        #define CMD_GET_CARD_TYPE	0x80
        #define CMD_GET_PORT_DDR	0xA0
        #define CMD_SET_PORT_DDR	0xA1
        #define CMD_READ_PORT		0xA2
        #define CMD_WRITE_PORT		0xA3
        #define CMD_GET_FW_VER		0xE0
        #define CMD_GET_BL_VER		0xE1
        #define CMD_GET_CFG_BYTE	0xF0
        #define CMD_SET_CFG_BYTE	0xF1
        #define CMD_READ_AUX		0xFD
        #define CMD_GET_HEARTBEAT	0xFE


    // Status codes
        #define STATUS_OK		0x3F
        #define STATUS_COMPLETE		0x40
        #define STATUS_EOF		0x60
        #define	STATUS_BUSY		0x80

        #define ERROR_MASK		0x3F

    // To be or'd with STATUS_COMPLETE
        #define ERROR_NO_DATA		0x08
        #define ERROR_INVALID_DRIVE	0x09
        #define ERROR_READ_ONLY		0x0A
        #define ERROR_ALREADY_MOUNT	0x0A
        #define ERROR_TOO_MANY_OPEN	0x12

    // Offset returned file numbers by 0x20, to disambiguate from errors
        #define FILENUM_OFFSET		0x20

    // STATUS_REG bit masks
    //
    // MMC_MCU_BUSY set by a write to CMD_REG by the Atom, cleared by a write by the MCU
    // MMC_MCU_READ set by a write by the Atom (to any reg), cleared by a read by the MCU
    // MCU_MMC_WROTE set by a write by the MCU cleared by a read by the Atom (any reg except status).
    //
        #define MMC_MCU_BUSY		0x01
        #define MMC_MCU_READ		0x02
        #define MMC_MCU_WROTE		0x04





        */


    function atommc2(cpu) {
        var self = {
            reset: function (hard) {

                this.configByte = 0x00; //eeprom[EE_SYSFLAGS];

            },
            MMCtoAtom: STATUS_BUSY,
            heartbeat: 0x55,
            MCUstatus: MMC_MCU_BUSY,
            configByte: 0,
            byteValueLatch:0,
            globalData: [],
            globalIndex: 0,
            globalDataPresent:0,

            WFN_WorkerTest: function()
            {
                console.log("WFN_WorkerTest" );
            },
            WFN_FileOpenRead: function()
            {
                console.log("WFN_FileOpenRead" );
            },
            WFN_DirectoryOpen: function()
            {
                console.log("WFN_DirectoryOpen" );
            },


            WriteDataPort: function(b)
            {
                self.MMCtoAtom = b;
            },
            ReadDataPort: function()
            {
                return self.MMCtoAtom;
            },

            write: function (addr, val) {
                console.log("WriteMMC 0x"+addr.toString(16)+" <- 0x"+val.toString(16));
                var worker = null;

                switch (addr & 0x0f) {
                    case CMD_REG:
                        var received = val & 0xff;
                        var filenum = 0;

                        // File Group 0x10-0x17, 0x30-0x37, 0x50-0x57, 0x70-0x77
                        // filenum = bits 6,5
                        // mask1 = 10011000 (test for file group command)
                        // mask2 = 10011111 (remove file number)
                        if ((received & 0x98) == 0x10) {
                            filenum = (received >> 5) & 3;
                            received &= 0x9F;
                        }

                        // Data Group 0x20-0x23, 0x24-0x27, 0x28-0x2B, 0x2C-0x2F
                        // filenum = bits 3,2
                        // mask1 = 11110000 (test for data group command)
                        // mask2 = 11110011 (remove file number)
                        if ((received & 0xf0) == 0x20) {
                            filenum = (received >> 2) & 3;
                            received &= 0xF3;
                        }

                        console.log("CMD_REG 0x" + (addr & 0x0f).toString(16) + " <- received 0x" + received.toString(16) + " filenum : " + filenum);

                        this.WriteDataPort(STATUS_BUSY);
                        this.MCUstatus = MMC_MCU_BUSY;

                        // Directory group, moved here 2011-05-29 PHS.
                        //
                        if (received == CMD_DIR_OPEN)
                        {
                            // reset the directory reader
                            //
                            // when 0x3f is read back from this register it is appropriate to
                            // start sending cmd 1s to get items.
                            //
                            worker = this.WFN_DirectoryOpen;
                        }
                        else if (received == CMD_DIR_READ)
                        {
                            // get next directory entry
                            //
                            worker = this.WFN_DirectoryRead;
                        }
                        else if (received == CMD_DIR_CWD)
                        {
                            // set CWD
                            //
                            worker = this.WFN_SetCWDirectory;
                        }

                            // File group.
                        //
                        else if (received == CMD_FILE_CLOSE)
                        {
                            // close the open file, flushing any unwritten data
                            //
                            worker = this.WFN_FileClose;
                        }
                        else if (received == CMD_FILE_OPEN_READ)
                        {
                            // open the file with name in global data buffer
                            //
                            worker = this.WFN_FileOpenRead;
                        }
                    else if (received == CMD_FILE_OPEN_WRITE)
                    {
                        // open the file with name in global data buffer for write
                        //
                        worker = this.WFN_FileOpenWrite;
                    }

// SP9 START

                    else if (received == CMD_FILE_OPEN_RAF)
                    {
                        // open the file with name in global data buffer for write/append
                        //
                        worker = WFN_FileOpenRAF;
                    }

// SP9 END

                    else if (received == CMD_FILE_DELETE)
                    {
                        // delete the file with name in global data buffer
                        //
                        worker = WFN_FileDelete;
                    }

// SP9 START

                    else if (received == CMD_FILE_GETINFO)
                    {
                        // return file's status byte
                        //
                        worker = this.WFN_FileGetInfo;
                    }
                    else if (received == CMD_FILE_SEEK)
                    {
                        // seek to a location within the file
                        //
                        worker = WFN_FileSeek;
                    }

// SP9 END

                    else if (received == CMD_INIT_READ)
                    {
                        // All data read requests must send CMD_INIT_READ before beggining reading
                        // data from READ_DATA_PORT. After execution of this command the first byte
                        // of data may be read from the READ_DATA_PORT.
                        //
                        this.WriteDataPort(this.globalData[0]);
                        this.globalIndex = 1;
                        // LatchedAddress
                        addr=READ_DATA_REG;
                    }
                    else if (received == CMD_INIT_WRITE)
                    {
                        // all data write requests must send CMD_INIT_WRITE here before poking data at
                        // WRITE_DATA_REG
                        // globalDataPresent is a flag to indicate whether data is present in the bfr.
                        //
                        this.globalIndex = 0;
                        this.globalDataPresent = 0;
                    }
                    else if (received == CMD_READ_BYTES)
                    {
                        // Replaces READ_BYTES_REG
                        // Must be previously written to latch reg.
                        this.globalAmount = this.byteValueLatch;
                        this.worker = WFN_FileRead;
                    }
                    else if (received == CMD_WRITE_BYTES)
                    {
                        // replaces WRITE_BYTES_REG
                        // Must be previously written to latch reg.
                        this.globalAmount = this.byteValueLatch;
                        this.worker = WFN_FileWrite;
                    }

                        //
                    // Exec a packet in the data buffer.
                    else if (received == CMD_EXEC_PACKET)
                    {
                        worker = WFN_ExecuteArbitrary;
                    }
                        else if (received == CMD_GET_FW_VER) // read firmware version
                        {
                            this.WriteDataPort(VSN_MAJ<<4|VSN_MIN);
                        }
                        else if (received == CMD_GET_BL_VER) // read bootloader version
                        {
                            this.WriteDataPort(blVersion);
                        }
                        else if (received == CMD_GET_CFG_BYTE) // read config byte
                        {
                            this.WriteDataPort(this.configByte);
                        }
                        else if (received == CMD_SET_CFG_BYTE) // write config byte
                        {
                            this.configByte = byteValueLatch;

                            WriteEEPROM(EE_SYSFLAGS, this.configByte);
                            this.WriteDataPort(STATUS_OK);
                        }
                        else if (received == CMD_READ_AUX) // read porta - latch & aux pin on dongle
                        {
                            this.WriteDataPort(this.LatchedAddress);
                        }

                        else if (received == CMD_GET_HEARTBEAT) {
                            console.log("heartbeat 0x"+self.heartbeat.toString(16));
                            this.WriteDataPort(self.heartbeat);
                            self.heartbeat ^= 0xff;
                        }
                            //
                            // Utility commands.
                        // Moved here 2011-05-29 PHS
                        else if (received == CMD_GET_CARD_TYPE) {
                            // get card type - it's a slowcmd despite appearance
                            // disk_initialize(0);
                            //#define CT_MMC 0x01 /* MMC ver 3 */
                            this.WriteDataPort(0x01);
                        } else if (received == CMD_GET_CFG_BYTE) // read config byte
                        {
                            this.WriteDataPort(this.configByte);
                        }
                        break;
                    case READ_DATA_REG: {
                        var received = val & 0xff;
                        console.log("write READ_DATA_REG 0x" + (addr & 0x0f).toString(16) + " <- received 0x" + received.toString(16) );
                        var q = this.globalIndex;
                        var dd = this.globalData[q];
                        this.WriteDataPort(dd);
                        ++this.globalIndex;

                        break;
                    }

                    case WRITE_DATA_REG: {
                        var received = val & 0xff;
                        console.log("WRITE_DATA_REG 0x" + (addr & 0x0f).toString(16) + " <- received 0x" + received.toString(16) );

                        this.globalData[this.globalIndex] = received;
                        ++this.globalIndex;

                        this.globalDataPresent = 1;
                        break;
                    }

                    case LATCH_REG: {
                        var received = val & 0xff;
                        console.log("LATCH_REG 0x" + (addr & 0x0f).toString(16) + " <- received 0x" + received.toString(16) );
                        this.byteValueLatch = received;
                        this.WriteDataPort(byteValueLatch);
                        break;
                    }
                    case STATUS_REG: {
                        // does nothing
                        var received = val & 0xff;
                        console.log("STATUS_REG 0x" + (addr & 0x0f).toString(16) + " <- received 0x" + received.toString(16) );
                    }
                }

                if (worker)
                    worker();

                        //CMD_GET_CFG_BYTE
            },
            read: function (addr) {

                var val = this.ReadDataPort();

                // console.log("ReadMMCz 0x"+addr.toString(16)+" -> 0x"+val.toString(16));

                switch (addr & 0x0f) {
                    case READ_DATA_REG: {
                        console.log("read READ_DATA_REG 0x" + (addr & 0x0f).toString(16) + " -> received 0x" + received.toString(16));

                        var q = this.globalIndex;
                        var dd = this.globalData[q];
                        this.WriteDataPort(dd);
                        ++this.globalIndex;

                        break;
                    }
                    case STATUS_REG: {
                        val = 0;
                        console.log("read STATUS_REG 0x" + (addr & 0x0f).toString(16) + " -> val 0x" + val.toString(16) );
                    }

                }


                return val;
                },


    };
        return self;
    }

    return {
        AtomMMC2: atommc2
    };
});
